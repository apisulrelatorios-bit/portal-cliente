-- Login com "e-mail ou usuário" (PRODUCT.md §3).
-- O Supabase Auth autentica por e-mail; quando a pessoa digita um nome de
-- usuário, o front pergunta aqui qual e-mail de login corresponde a ele.
-- Só devolve o e-mail de quem tem username cadastrado e vínculo/admin ativo.
create or replace function public.email_para_login(p_login text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username is not null
    and lower(p.username) = lower(trim(p_login))
    and (p.is_platform_admin or exists (
      select 1 from public.memberships m where m.user_id = p.id and m.ativo
    ))
  limit 1;
$$;

revoke all on function public.email_para_login(text) from public;
grant execute on function public.email_para_login(text) to anon, authenticated;
