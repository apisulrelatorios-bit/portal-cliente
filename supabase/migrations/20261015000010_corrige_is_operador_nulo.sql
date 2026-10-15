-- is_operador devolvia NULL (em vez de false) para quem não é membro do
-- tenant. No RLS isso já negava acesso, mas em "if not private.is_operador()"
-- o NULL deixava passar. Agora sempre devolve true/false.
create or replace function private.is_operador(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_platform_admin()
      or coalesce(private.papel_no_tenant(p_tenant) = 'operador', false);
$$;
