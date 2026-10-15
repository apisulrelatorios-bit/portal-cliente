-- =====================================================================
-- Usuários de um cliente, para a página usuarios.html do operador.
-- Operador (ou Admin) do tenant vê quem tem acesso, com e-mail real,
-- situação do login e último acesso (dados que ficam em auth.users).
-- =====================================================================
create or replace function public.listar_usuarios_do_cliente(p_tenant uuid)
returns table (
  id              uuid,
  nome            text,
  username        text,
  email           text,
  papel           public.papel_tenant,
  pode_configurar boolean,
  ativo           boolean,
  bloqueado       boolean,
  ultimo_acesso   timestamptz,
  criado_em       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_operador(p_tenant) then
    raise exception 'Acesso restrito aos operadores deste cliente.' using errcode = '42501';
  end if;
  return query
  select p.id, p.nome, p.username,
         case when u.email ilike '%@usuarios.portal.internal' then null else u.email::text end,
         m.papel, m.pode_configurar, m.ativo,
         coalesce(u.banned_until > now(), false),
         u.last_sign_in_at,
         m.created_at
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.tenant_id = p_tenant
  order by m.papel, lower(coalesce(nullif(p.nome, ''), u.email));
end;
$$;

revoke all on function public.listar_usuarios_do_cliente(uuid) from public, anon;
grant execute on function public.listar_usuarios_do_cliente(uuid) to authenticated;
