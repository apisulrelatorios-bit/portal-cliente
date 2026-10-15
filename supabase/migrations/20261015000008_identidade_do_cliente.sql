-- =====================================================================
-- Identidade do cliente (logo e nome) é configurada DENTRO do tenant,
-- pelo operador com "pode configurar" (ou pelo Admin).
-- =====================================================================

-- Operador com permissão passa a poder renomear o cliente.
grant update (nome) on public.tenants to authenticated;

-- Bucket público para logos: leitura aberta (a logo aparece no login e no
-- topo), escrita só em <tenant_id>/... por quem pode configurar o tenant.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.pode_gravar_logo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (storage.foldername(p_nome))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.can_configure(((storage.foldername(p_nome))[1])::uuid)
    else false
  end;
$$;
revoke all on function private.pode_gravar_logo(text) from public, anon;
grant execute on function private.pode_gravar_logo(text) to authenticated;

create policy logos_select on storage.objects for select to authenticated
  using (bucket_id = 'logos' and private.pode_gravar_logo(name));
create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and private.pode_gravar_logo(name));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and private.pode_gravar_logo(name))
  with check (bucket_id = 'logos' and private.pode_gravar_logo(name));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and private.pode_gravar_logo(name));
