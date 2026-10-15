/*
 * portal-data.js
 * Camada de dados do portal sobre o Supabase (substitui o Power Automate).
 *
 * - Login por e-mail ou usuário (Supabase Auth + RPC email_para_login)
 * - Tenants do usuário e tenant ativo (localStorage "portalTenantId")
 * - Módulos, abas e visões do tenant
 * - Itens das listas, convertidos para os nomes de campo que os cards
 *   (content-funcional.js / dashboard-funcional.js) já conhecem
 *
 * Toda a segurança está no banco (RLS). A chave abaixo é a chave pública
 * (publishable) do projeto e pode ficar no front.
 *
 * Requer: @supabase/supabase-js (UMD) carregado antes deste arquivo.
 */
(function (window) {
  "use strict";

  var SUPABASE_URL = "https://hqxkqzhioilnrvmaylgy.supabase.co";
  var SUPABASE_KEY = "sb_publishable_DGDGvLlTO2YVVmEjsAzvpQ_73lIfJtH";
  var TENANT_KEY = "portalTenantId";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("[Portal] supabase-js não foi carregado.");
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "portal-auth" }
  });

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function storageSet(key, value) {
    try {
      if (value === null || value === undefined) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (_) {}
  }

  function must(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  /* ---------------- Compressão de imagens ----------------
     Toda imagem enviada (foto de perfil, logo, thumbnail) é reduzida e
     convertida para WEBP no navegador antes do upload, para economizar
     espaço. opcoes: { max: lado maior em px, qualidade: 0–1, quadrado: bool }
     SVG é mantido como está (já é leve e vetorial). */
  function carregarImagem(arquivo) {
    return new Promise(function (ok, falha) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); ok(img); };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error("Não foi possível ler a imagem.")); };
      img.src = url;
    });
  }

  async function comprimirImagem(arquivo, opcoes) {
    opcoes = opcoes || {};
    if (!arquivo || arquivo.type === "image/svg+xml") return arquivo;
    var max = opcoes.max || 1024;
    var qualidade = opcoes.qualidade || 0.75;
    var img = await carregarImagem(arquivo);
    var sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (opcoes.quadrado) {
      var lado = Math.min(sw, sh);
      sx = Math.round((sw - lado) / 2); sy = Math.round((sh - lado) / 2); sw = sh = lado;
    }
    var escala = Math.min(1, max / Math.max(sw, sh));
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * escala));
    canvas.height = Math.max(1, Math.round(sh * escala));
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    var blob = await new Promise(function (ok) { canvas.toBlob(ok, "image/webp", qualidade); });
    if (!blob) return arquivo;
    /* Se o navegador não gera WEBP, cai para JPEG (sem transparência). */
    if (blob.type !== "image/webp") {
      blob = await new Promise(function (ok) { canvas.toBlob(ok, "image/jpeg", qualidade); }) || blob;
    }
    return blob.size < arquivo.size || escala < 1 || opcoes.quadrado ? blob : arquivo;
  }

  /* ---------------- Autenticação ---------------- */

  async function getSession() {
    var res = await client.auth.getSession();
    return res.data ? res.data.session : null;
  }

  async function signIn(login, senha) {
    login = String(login || "").trim();
    var email = login;
    if (login.indexOf("@") === -1) {
      var lookup = await client.rpc("email_para_login", { p_login: login });
      if (lookup.error) throw lookup.error;
      if (!lookup.data) return { error: "Usuário ou senha inválidos." };
      email = lookup.data;
    }
    var res = await client.auth.signInWithPassword({ email: email, password: senha });
    if (res.error) {
      var msg = /invalid login credentials/i.test(res.error.message)
        ? "Usuário ou senha inválidos."
        : /email not confirmed/i.test(res.error.message)
          ? "E-mail ainda não confirmado."
          : res.error.message;
      return { error: msg };
    }
    return { session: res.data.session };
  }

  async function signOut() {
    try { await client.auth.signOut(); } catch (_) {}
    storageSet(TENANT_KEY, null);
  }

  /* ---------------- Perfil e tenants ---------------- */

  async function loadProfile(userId) {
    return must(await client.from("profiles")
      .select("id, nome, username, email, foto_url, is_platform_admin")
      .eq("id", userId)
      .maybeSingle()) || { id: userId, nome: "", is_platform_admin: false };
  }

  function queryMemberships(userId) {
    return client.from("memberships")
      .select("tenant_id, papel, pode_configurar")
      .eq("user_id", userId)
      .eq("ativo", true).then(must);
  }

  function queryTenants() {
    return client.from("tenants")
      .select("id, slug, nome, logo_url, tema, telas")
      .eq("ativo", true)
      .order("nome").then(must);
  }

  function queryModulos(tenantId) {
    return client.from("modulos")
      .select("id, slug, nome, icone, ordem")
      .eq("tenant_id", tenantId)
      .eq("visivel", true)
      .order("ordem").then(must);
  }

  /* Junta tenants + vínculos: só os portais de cliente em que o usuário tem
     vínculo, com o papel dele em cada um. O Admin da plataforma usa a
     Administração e só entra num portal se também tiver vínculo com ele. */
  function combineTenants(profile, memberships, tenants) {
    var byTenant = {};
    memberships.forEach(function (m) { byTenant[m.tenant_id] = m; });
    return tenants
      .filter(function (t) { return byTenant[t.id]; })
      .map(function (t) {
        var m = byTenant[t.id];
        t.papel = m.papel;
        t.pode_configurar = m.papel === "operador" && Boolean(m.pode_configurar);
        return t;
      });
  }

  async function listTenants(profile) {
    var res = await Promise.all([queryMemberships(profile.id), queryTenants()]);
    return combineTenants(profile, res[0], res[1]);
  }

  function getActiveTenantId() { return storageGet(TENANT_KEY); }
  function setActiveTenantId(id) { storageSet(TENANT_KEY, id); }

  /* ---------------- Contexto completo da página ---------------- */

  async function loadContext() {
    var session = await getSession();
    if (!session) return { session: null };

    var uid = session.user.id;
    var stored = getActiveTenantId();
    /* Uma rodada só: perfil, vínculos, tenants e (palpite) módulos do tenant salvo. */
    var res = await Promise.all([
      loadProfile(uid),
      queryMemberships(uid),
      queryTenants(),
      stored ? queryModulos(stored).catch(function () { return null; }) : Promise.resolve(null)
    ]);
    var profile = res[0];
    var tenants = combineTenants(profile, res[1], res[2]);
    var tenant = tenants.filter(function (t) { return t.id === stored; })[0] ||
      (tenants.length === 1 ? tenants[0] : null);
    if (tenant) setActiveTenantId(tenant.id);

    var modulos = [];
    if (tenant) modulos = (tenant.id === stored && res[3]) ? res[3] : await queryModulos(tenant.id);

    return {
      session: session,
      user: session.user,
      profile: profile,
      tenants: tenants,
      tenant: tenant,
      modulos: modulos
    };
  }

  /* ---------------- Itens e visões ---------------- */

  /* Rótulos das opções de escolha, por lista e chave de coluna:
     { lista_id: { chave: { valor: rotulo } } } */
  async function loadOptionLabels(tenantId) {
    var res = await Promise.all([
      client.from("colunas").select("id, lista_id, chave").eq("tenant_id", tenantId).then(must),
      client.from("coluna_opcoes").select("coluna_id, valor, rotulo").eq("tenant_id", tenantId).then(must)
    ]);
    var colunas = res[0];
    var opcoes = res[1];
    var colById = {};
    colunas.forEach(function (c) { colById[c.id] = c; });
    var map = {};
    opcoes.forEach(function (o) {
      var col = colById[o.coluna_id];
      if (!col || !o.rotulo) return;
      map[col.lista_id] = map[col.lista_id] || {};
      map[col.lista_id][col.chave] = map[col.lista_id][col.chave] || {};
      map[col.lista_id][col.chave][o.valor] = o.rotulo;
    });
    return map;
  }

  /* Converte uma linha de "itens" para os nomes de campo do contrato antigo
     (SharePoint/Power Automate), que os cards e a dashboard já leem. */
  function toCardItem(row, labels) {
    var d = row.dados || {};
    var rot = (labels[row.lista_id] || {});
    var tipo = d.tipo_midia || "";
    var item = {
      Id: row.id,
      ListaId: row.lista_id,
      Title: d.titulo || "",
      Vertente: Array.isArray(d.vertente) ? d.vertente.join(", ") : (d.vertente || ""),
      Categoria: d.categoria || "",
      Tema: d.tema || "",
      TipoMidia: tipo,
      Descricao: d.descricao || "",
      OrdemExibicao: d.ordem_exibicao === undefined ? 9999 : d.ordem_exibicao,
      UrlLink: d.url_link || "",
      Link_thumbnail: d.thumbnail || "",
      Ativo: d.ativo === undefined ? true : d.ativo,
      Modified: row.updated_at,
      Created: row.created_at
    };
    item.__midiaRotulo = (rot.tipo_midia && rot.tipo_midia[tipo]) || "";
    item.__dados = d;
    return item;
  }

  async function loadTenantItems(tenantId) {
    var res = await Promise.all([
      client.from("itens").select("id, lista_id, dados, created_at, updated_at").eq("tenant_id", tenantId).then(must),
      loadOptionLabels(tenantId)
    ]);
    var rows = res[0];
    var labels = res[1];
    return rows.map(function (row) { return toCardItem(row, labels); });
  }

  function matchesFilter(dados, f) {
    var v = dados[f.coluna];
    switch (f.op) {
      case "igual":
        if (f.valor === true || f.valor === false) return (v === undefined ? true : v) === f.valor;
        return v === f.valor;
      case "diferente":
        return v !== f.valor;
      case "contem":
        if (Array.isArray(v)) return v.indexOf(f.valor) !== -1;
        return String(v || "").toLowerCase().indexOf(String(f.valor).toLowerCase()) !== -1;
      case "vazio":
        return v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
      case "preenchido":
        return !(v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length));
      default:
        return true;
    }
  }

  function compare(a, b) {
    if (a === b) return 0;
    if (a === undefined || a === null) return 1;
    if (b === undefined || b === null) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
  }

  /* Aplica a configuração de uma visão (filtros + ordenação) aos itens. */
  function applyView(items, config, listaId) {
    config = config || {};
    var filtros = config.filtros || [];
    var ordem = config.ordenar_por || [];
    return items
      .filter(function (item) {
        if (listaId && item.ListaId !== listaId) return false;
        return filtros.every(function (f) { return matchesFilter(item.__dados, f); });
      })
      .sort(function (a, b) {
        for (var i = 0; i < ordem.length; i++) {
          var c = compare(a.__dados[ordem[i].coluna], b.__dados[ordem[i].coluna]);
          if (c !== 0) return ordem[i].direcao === "desc" ? -c : c;
        }
        return 0;
      });
  }

  /* Abas visíveis de um módulo, com a visão de cada uma (sem itens). */
  function loadAbas(moduloId) {
    return client.from("abas")
      .select("id, nome, ordem, visao:visoes(id, lista_id, config)")
      .eq("modulo_id", moduloId)
      .eq("visivel", true)
      .order("ordem").then(must);
  }

  /* Monta o módulo: abas + itens de cada aba já filtrados pela visão. */
  function buildModule(modulo, abas, items) {
    return {
      id: modulo.id,
      slug: modulo.slug,
      nome: modulo.nome,
      icone: modulo.icone,
      abas: abas.map(function (aba) {
        var visao = aba.visao || {};
        var config = visao.config || {};
        return {
          id: aba.id,
          nome: aba.nome,
          agruparPor: (config.agrupar_por || [])[0] || null,
          exibicao: config.exibicao || "cards",
          itens: visao.lista_id ? applyView(items, config, visao.lista_id) : []
        };
      })
    };
  }

  /* Compatível com a chamada antiga: busca o módulo pelo slug. */
  async function loadModule(tenantId, slug, items) {
    var modulo = must(await client.from("modulos")
      .select("id, slug, nome, icone")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .eq("visivel", true)
      .maybeSingle());
    if (!modulo) return null;
    return buildModule(modulo, await loadAbas(modulo.id), items);
  }

  /* ---------------- Administração (só Admin; o banco confere) ---------------- */

  function rpc(name, args) {
    return client.rpc(name, args || {}).then(must);
  }

  /* Chama a Edge Function admin-usuarios e devolve a mensagem de erro dela. */
  async function adminUsuarios(acao, payload) {
    var res = await client.functions.invoke("admin-usuarios", {
      body: Object.assign({ acao: acao }, payload || {})
    });
    if (res.error) {
      var msg = res.error.message;
      try {
        var body = await res.error.context.json();
        if (body && body.erro) msg = body.erro;
      } catch (_) {}
      throw new Error(msg);
    }
    return res.data;
  }

  var admin = {
    listarTenants: function () { return rpc("admin_listar_tenants"); },
    listarUsuarios: function () { return rpc("admin_listar_usuarios"); },
    listarTemplates: async function () {
      return must(await client.from("templates").select("id, slug, nome").order("nome"));
    },
    criarTenant: function (dados) {
      return rpc("provisionar_tenant", {
        p_nome: dados.nome, p_slug: dados.slug, p_template: dados.template,
        p_incluir_itens: false, p_logo_url: dados.logo_url || null
      });
    },
    atualizarTenant: function (dados) {
      return rpc("admin_atualizar_tenant", {
        p_id: dados.id, p_nome: dados.nome, p_logo_url: dados.logo_url || null,
        p_telas: dados.telas, p_ativo: dados.ativo
      });
    },
    atualizarNome: async function (userId, nome) {
      must(await client.from("profiles").update({ nome: nome }).eq("id", userId));
    },
    salvarVinculo: async function (v) {
      must(await client.from("memberships").upsert({
        user_id: v.user_id, tenant_id: v.tenant_id, papel: v.papel,
        pode_configurar: v.papel === "operador" && Boolean(v.pode_configurar), ativo: v.ativo !== false
      }, { onConflict: "user_id,tenant_id" }));
    },
    removerVinculo: async function (userId, tenantId) {
      must(await client.from("memberships").delete().eq("user_id", userId).eq("tenant_id", tenantId));
    },
    criarUsuario: function (dados) { return adminUsuarios("criar_usuario", dados); },
    redefinirSenha: function (userId, senha) { return adminUsuarios("redefinir_senha", { user_id: userId, senha: senha }); },
    bloquear: function (userId, bloquear) { return adminUsuarios("bloquear", { user_id: userId, bloquear: bloquear }); },
    definirAdmin: function (userId, valor) { return adminUsuarios("definir_admin", { user_id: userId, admin: valor }); }
  };

  /* ---------------- Configurações do tenant (operador com "pode configurar") ---------------- */

  var LOGO_BUCKET = "logos";
  var LOGO_PREFIXO = SUPABASE_URL + "/storage/v1/object/public/" + LOGO_BUCKET + "/";

  var configuracao = {
    /* Nome, logo e telas do cliente (o banco confere a permissão). */
    salvar: async function (tenantId, dados) {
      must(await client.from("tenants").update({
        nome: dados.nome, logo_url: dados.logo_url || null, telas: dados.telas
      }).eq("id", tenantId).select("id").single());
    },
    /* Envia a imagem para logos/<tenant_id>/ e devolve a URL pública. */
    enviarLogo: async function (tenantId, arquivo) {
      var img = await comprimirImagem(arquivo, { max: 512, qualidade: 0.85 });
      var ext = ({ "image/webp": "webp", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/gif": "gif" })[img.type] || "png";
      var caminho = tenantId + "/logo-" + Date.now() + "." + ext;
      must(await client.storage.from(LOGO_BUCKET).upload(caminho, img, {
        cacheControl: "3600", upsert: false, contentType: img.type
      }));
      return client.storage.from(LOGO_BUCKET).getPublicUrl(caminho).data.publicUrl;
    },
    /* Apaga do armazenamento uma logo antiga que foi enviada por aqui. */
    apagarLogo: async function (url) {
      if (!url || url.indexOf(LOGO_PREFIXO) !== 0) return;
      var caminho = decodeURIComponent(url.slice(LOGO_PREFIXO.length).split("?")[0]);
      await client.storage.from(LOGO_BUCKET).remove([caminho]);
    }
  };

  /* ---------------- Usuários do cliente (operador do tenant) ---------------- */

  var equipe = {
    listar: function (tenantId) { return rpc("listar_usuarios_do_cliente", { p_tenant: tenantId }); },
    /* Operador só cria usuários do tipo Cliente, e só no cliente atual. */
    criarCliente: function (tenantId, dados) {
      return adminUsuarios("criar_usuario", {
        nome: dados.nome, email: dados.email, username: dados.username, senha: dados.senha,
        vinculos: [{ tenant_id: tenantId, papel: "cliente", pode_configurar: false }]
      });
    },
    redefinirSenha: admin.redefinirSenha,
    bloquear: admin.bloquear,
    removerAcesso: admin.removerVinculo
  };

  /* ---------------- Conteúdos (listas no estilo SharePoint, operador) ---------------- */

  var THUMB_BUCKET = "thumbnails";
  var THUMB_PREFIXO = SUPABASE_URL + "/storage/v1/object/public/" + THUMB_BUCKET + "/";

  var conteudos = {
    listas: function (tenantId) {
      return client.from("listas").select("id, slug, nome, descricao")
        .eq("tenant_id", tenantId).order("nome").then(must);
    },
    /* Colunas da lista (na ordem) com as opções de escolha de cada uma. */
    estrutura: async function (listaId) {
      var colunas = must(await client.from("colunas")
        .select("id, chave, rotulo, tipo, obrigatoria, padrao, ordem, oculta, config")
        .eq("lista_id", listaId).order("ordem"));
      var ids = colunas.map(function (c) { return c.id; });
      var opcoes = ids.length ? must(await client.from("coluna_opcoes")
        .select("coluna_id, valor, rotulo, cor, ordem, ativa")
        .in("coluna_id", ids).order("ordem")) : [];
      colunas.forEach(function (c) {
        c.opcoes = opcoes.filter(function (o) { return o.coluna_id === c.id; });
      });
      return colunas;
    },
    itens: function (listaId) {
      return client.from("itens").select("id, dados, created_at, updated_at")
        .eq("lista_id", listaId).order("updated_at", { ascending: false }).then(must);
    },
    criar: async function (tenantId, listaId, dados) {
      return must(await client.from("itens").insert({ tenant_id: tenantId, lista_id: listaId, dados: dados })
        .select("id").single());
    },
    atualizar: async function (id, dados) {
      return must(await client.from("itens").update({ dados: dados }).eq("id", id).select("id").single());
    },
    excluir: async function (id) {
      must(await client.from("itens").delete().eq("id", id));
    },
    /* Envia a imagem da capa para thumbnails/<tenant_id>/ e devolve a URL pública. */
    enviarThumbnail: async function (tenantId, blob, nomeBase) {
      blob = await comprimirImagem(blob, { max: 800, qualidade: 0.72 });
      var tipo = blob.type || "image/png";
      var ext = ({ "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" })[tipo] || "png";
      var base = String(nomeBase || "thumbnail").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "thumbnail";
      var caminho = tenantId + "/" + base + "-" + Date.now() + "." + ext;
      must(await client.storage.from(THUMB_BUCKET).upload(caminho, blob, {
        cacheControl: "3600", upsert: false, contentType: tipo
      }));
      return client.storage.from(THUMB_BUCKET).getPublicUrl(caminho).data.publicUrl;
    },
    /* Apaga uma capa antiga, se ela foi enviada por aqui (thumbnails do Supabase). */
    apagarThumbnail: async function (url) {
      if (!url || url.indexOf(THUMB_PREFIXO) !== 0) return;
      var caminho = decodeURIComponent(url.slice(THUMB_PREFIXO.length).split("?")[0]);
      await client.storage.from(THUMB_BUCKET).remove([caminho]);
    }
  };

  /* ---------------- Foto de perfil (cada usuário a sua) ---------------- */

  var AVATAR_BUCKET = "avatars";
  var AVATAR_PREFIXO = SUPABASE_URL + "/storage/v1/object/public/" + AVATAR_BUCKET + "/";

  var perfil = {
    /* Comprime (256×256), envia, grava em profiles.foto_url e apaga a antiga. */
    enviarFoto: async function (userId, arquivo, fotoAntiga) {
      var img = await comprimirImagem(arquivo, { max: 256, qualidade: 0.8, quadrado: true });
      var ext = img.type === "image/jpeg" ? "jpg" : "webp";
      var caminho = userId + "/foto-" + Date.now() + "." + ext;
      must(await client.storage.from(AVATAR_BUCKET).upload(caminho, img, {
        cacheControl: "3600", upsert: false, contentType: img.type
      }));
      var url = client.storage.from(AVATAR_BUCKET).getPublicUrl(caminho).data.publicUrl;
      try {
        must(await client.from("profiles").update({ foto_url: url }).eq("id", userId).select("id").single());
      } catch (e) {
        await client.storage.from(AVATAR_BUCKET).remove([caminho]);
        throw e;
      }
      if (fotoAntiga) perfil.apagarArquivo(fotoAntiga).catch(function () {});
      return url;
    },
    removerFoto: async function (userId, fotoAtual) {
      must(await client.from("profiles").update({ foto_url: null }).eq("id", userId).select("id").single());
      if (fotoAtual) perfil.apagarArquivo(fotoAtual).catch(function () {});
    },
    apagarArquivo: async function (url) {
      if (!url || url.indexOf(AVATAR_PREFIXO) !== 0) return;
      var caminho = decodeURIComponent(url.slice(AVATAR_PREFIXO.length).split("?")[0]);
      await client.storage.from(AVATAR_BUCKET).remove([caminho]);
    }
  };

  window.PortalData = {
    comprimirImagem: comprimirImagem,
    perfil: perfil,
    admin: admin,
    configuracao: configuracao,
    equipe: equipe,
    conteudos: conteudos,
    client: client,
    getSession: getSession,
    signIn: signIn,
    signOut: signOut,
    loadContext: loadContext,
    listTenants: listTenants,
    loadProfile: loadProfile,
    getActiveTenantId: getActiveTenantId,
    setActiveTenantId: setActiveTenantId,
    loadTenantItems: loadTenantItems,
    loadModule: loadModule,
    loadAbas: loadAbas,
    buildModule: buildModule,
    applyView: applyView
  };
})(window);
