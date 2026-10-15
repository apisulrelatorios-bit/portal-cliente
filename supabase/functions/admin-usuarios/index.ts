// Edge Function: admin-usuarios
// Operações que exigem a chave de serviço (service role) e por isso não
// podem rodar no navegador: criar login, redefinir senha, bloquear e
// promover a Admin.
//
// Quem pode chamar:
// - Admin da plataforma: tudo.
// - Operador: só usuários do tipo "cliente" nos tenants em que é operador.
//
// Ações (POST JSON { acao, ... }):
//   criar_usuario   { nome, email?, username?, senha, admin?, vinculos: [{ tenant_id, papel, pode_configurar }] }
//   redefinir_senha { user_id, senha }
//   bloquear        { user_id, bloquear }
//   definir_admin   { user_id, admin }
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DOMINIO_INTERNO = "usuarios.portal.internal";
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class Falha extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

type Vinculo = { tenant_id: string; papel: "operador" | "cliente"; pode_configurar?: boolean };

type Chamador = {
  id: string;
  admin: boolean;
  tenantsOperador: Set<string>;
};

async function identificarChamador(req: Request, svc: SupabaseClient): Promise<Chamador> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Falha("Sessão ausente.", 401);
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) throw new Falha("Sessão inválida. Entre novamente.", 401);

  const { data: perfil } = await svc.from("profiles")
    .select("is_platform_admin").eq("id", data.user.id).maybeSingle();
  const { data: vinculos } = await svc.from("memberships")
    .select("tenant_id, papel, ativo").eq("user_id", data.user.id);

  return {
    id: data.user.id,
    admin: Boolean(perfil?.is_platform_admin),
    tenantsOperador: new Set(
      (vinculos ?? []).filter((v) => v.ativo && v.papel === "operador").map((v) => v.tenant_id),
    ),
  };
}

/* Operador só mexe em quem é exclusivamente cliente dos tenants dele. */
async function exigirGestaoDoUsuario(svc: SupabaseClient, quem: Chamador, alvoId: string) {
  if (quem.admin) return;
  const { data: perfil } = await svc.from("profiles")
    .select("is_platform_admin").eq("id", alvoId).maybeSingle();
  const { data: vinculos } = await svc.from("memberships")
    .select("tenant_id, papel").eq("user_id", alvoId);
  const ok = !perfil?.is_platform_admin && (vinculos ?? []).length > 0 &&
    (vinculos ?? []).every((v) => v.papel === "cliente" && quem.tenantsOperador.has(v.tenant_id));
  if (!ok) throw new Falha("Você não tem permissão para gerenciar este usuário.", 403);
}

function validarSenha(senha: unknown): string {
  const s = String(senha ?? "");
  if (s.length < 8) throw new Falha("A senha precisa ter pelo menos 8 caracteres.");
  return s;
}

async function criarUsuario(svc: SupabaseClient, quem: Chamador, body: Record<string, unknown>) {
  const nome = String(body.nome ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const username = String(body.username ?? "").trim().toLowerCase();
  const senha = validarSenha(body.senha);
  const tornarAdmin = Boolean(body.admin);
  const vinculos = (Array.isArray(body.vinculos) ? body.vinculos : []) as Vinculo[];

  if (!nome) throw new Falha("Informe o nome.");
  if (!email && !username) throw new Falha("Informe um e-mail, um nome de usuário ou os dois.");
  if (email && !EMAIL_RE.test(email)) throw new Falha("E-mail inválido.");
  if (email.endsWith("@" + DOMINIO_INTERNO)) throw new Falha("E-mail inválido.");
  if (username && !USERNAME_RE.test(username)) {
    throw new Falha("Usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.");
  }
  for (const v of vinculos) {
    if (!v.tenant_id || !["operador", "cliente"].includes(v.papel)) throw new Falha("Vínculo inválido.");
  }

  if (!quem.admin) {
    if (tornarAdmin) throw new Falha("Só o administrador pode criar outro administrador.", 403);
    if (!vinculos.length) throw new Falha("Escolha ao menos um cliente.", 403);
    for (const v of vinculos) {
      if (v.papel !== "cliente" || v.pode_configurar || !quem.tenantsOperador.has(v.tenant_id)) {
        throw new Falha("Operadores só podem criar usuários do tipo Cliente nos seus clientes.", 403);
      }
    }
  }

  if (username) {
    const { data: existente } = await svc.from("profiles")
      .select("id").ilike("username", username).maybeSingle();
    if (existente) throw new Falha("Esse nome de usuário já está em uso.", 409);
  }

  const { data: criado, error } = await svc.auth.admin.createUser({
    email: email || `${username}@${DOMINIO_INTERNO}`,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, username: username || null },
  });
  if (error || !criado.user) {
    const msg = /already.*registered|already been registered|exists/i.test(error?.message ?? "")
      ? "Já existe um usuário com esse e-mail."
      : `Não foi possível criar o usuário: ${error?.message ?? "erro desconhecido"}`;
    throw new Falha(msg, 409);
  }
  const userId = criado.user.id;

  try {
    if (vinculos.length) {
      const { error: errV } = await svc.from("memberships").insert(vinculos.map((v) => ({
        user_id: userId,
        tenant_id: v.tenant_id,
        papel: v.papel,
        pode_configurar: v.papel === "operador" && Boolean(v.pode_configurar),
      })));
      if (errV) throw errV;
    }
    if (tornarAdmin) {
      const { error: errA } = await svc.from("profiles").update({ is_platform_admin: true }).eq("id", userId);
      if (errA) throw errA;
    }
  } catch (e) {
    // Desfaz o login criado para não deixar usuário pela metade.
    await svc.auth.admin.deleteUser(userId);
    throw new Falha(`Não foi possível salvar os vínculos: ${(e as Error).message}`, 500);
  }

  return { user_id: userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const quem = await identificarChamador(req, svc);
    if (!quem.admin && quem.tenantsOperador.size === 0) {
      throw new Falha("Acesso restrito a administradores e operadores.", 403);
    }
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    switch (body.acao) {
      case "criar_usuario":
        return json(await criarUsuario(svc, quem, body));

      case "redefinir_senha": {
        const userId = String(body.user_id ?? "");
        await exigirGestaoDoUsuario(svc, quem, userId);
        const { error } = await svc.auth.admin.updateUserById(userId, { password: validarSenha(body.senha) });
        if (error) throw new Falha(error.message);
        return json({ ok: true });
      }

      case "bloquear": {
        const userId = String(body.user_id ?? "");
        if (userId === quem.id) throw new Falha("Você não pode bloquear a si mesmo.");
        await exigirGestaoDoUsuario(svc, quem, userId);
        const { error } = await svc.auth.admin.updateUserById(userId, {
          ban_duration: body.bloquear ? "876000h" : "none",
        });
        if (error) throw new Falha(error.message);
        return json({ ok: true });
      }

      case "definir_admin": {
        if (!quem.admin) throw new Falha("Só o administrador pode alterar administradores.", 403);
        const userId = String(body.user_id ?? "");
        if (userId === quem.id && !body.admin) throw new Falha("Você não pode remover o seu próprio acesso de administrador.");
        const { error } = await svc.from("profiles").update({ is_platform_admin: Boolean(body.admin) }).eq("id", userId);
        if (error) throw new Falha(error.message);
        return json({ ok: true });
      }

      default:
        throw new Falha("Ação desconhecida.");
    }
  } catch (e) {
    if (e instanceof Falha) return json({ erro: e.message }, e.status);
    console.error(e);
    return json({ erro: "Erro interno." }, 500);
  }
});
