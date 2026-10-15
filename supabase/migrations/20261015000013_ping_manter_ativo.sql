-- Consulta mínima chamada pela ação do GitHub "manter-supabase-ativo"
-- (a cada 3 dias) para o projeto gratuito não ser pausado por inatividade.
-- Não lê nenhuma tabela: só devolve a hora do banco.
create or replace function public.ping()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
