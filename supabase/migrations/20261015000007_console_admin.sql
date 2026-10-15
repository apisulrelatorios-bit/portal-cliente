-- =====================================================================
-- Console do Admin (PRODUCT.md §6): leitura consolidada de clientes e
-- usuários e edição dos campos de tenant que só o Admin pode mudar.
-- Criação/bloqueio/senha de usuários ficam na Edge Function admin-usuarios.
-- =====================================================================

create or replace function private.exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.exigir_admin() from public, anon;
grant execute on function private.exigir_admin() to authenticated;

-- Clientes com totais de usuários e itens.
create or replace function public.admin_listar_tenants()
returns table (
  id         uuid,
  slug       text,
  nome       text,
  logo_url   text,
  telas      jsonb,
  ativo      boolean,
  created_at timestamptz,
  template   text,
  usuarios   bigint,
  itens      bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_admin();
  return query
  select t.id, t.slug, t.nome, t.logo_url, t.telas, t.ativo, t.created_at, tp.nome,
         (select count(*) from public.memberships m where m.tenant_id = t.id and m.ativo),
         (select count(*) from public.itens i where i.tenant_id = t.id)
  from public.tenants t
  left join public.templates tp on tp.id = t.template_id
  order by t.nome;
end;
$$;

-- Nome, logo, telas e ativação de um cliente.
create or replace function public.admin_atualizar_tenant(
  p_id       uuid,
  p_nome     text,
  p_logo_url text,
  p_telas    jsonb,
  p_ativo    boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_admin();
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome do cliente.' using errcode = '22023';
  end if;
  update public.tenants
  set nome     = trim(p_nome),
      logo_url = nullif(trim(coalesce(p_logo_url, '')), ''),
      telas    = coalesce(p_telas, telas),
      ativo    = coalesce(p_ativo, ativo)
  where id = p_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

-- Usuários com e-mail real, situação no Auth e vínculos.
create or replace function public.admin_listar_usuarios()
returns table (
  id                uuid,
  nome              text,
  username          text,
  email             text,
  is_platform_admin boolean,
  bloqueado         boolean,
  ultimo_acesso     timestamptz,
  criado_em         timestamptz,
  vinculos          jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_admin();
  return query
  select p.id, p.nome, p.username,
         case when u.email ilike '%@usuarios.portal.internal' then null else u.email::text end,
         p.is_platform_admin,
         coalesce(u.banned_until > now(), false),
         u.last_sign_in_at,
         u.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'tenant_id', m.tenant_id, 'tenant', t.nome, 'papel', m.papel,
                    'pode_configurar', m.pode_configurar, 'ativo', m.ativo)
                  order by t.nome)
           from public.memberships m
           join public.tenants t on t.id = m.tenant_id
           where m.user_id = p.id
         ), '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.id
  order by lower(coalesce(nullif(p.nome, ''), u.email));
end;
$$;

revoke all on function public.admin_listar_tenants() from public, anon;
revoke all on function public.admin_atualizar_tenant(uuid, text, text, jsonb, boolean) from public, anon;
revoke all on function public.admin_listar_usuarios() from public, anon;
grant execute on function public.admin_listar_tenants() to authenticated;
grant execute on function public.admin_atualizar_tenant(uuid, text, text, jsonb, boolean) to authenticated;
grant execute on function public.admin_listar_usuarios() to authenticated;
