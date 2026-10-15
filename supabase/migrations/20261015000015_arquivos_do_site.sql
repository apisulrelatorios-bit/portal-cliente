-- =====================================================================
-- Arquivos estáticos do próprio site (fontes e marca Apisul): bucket
-- público "site". Leitura aberta; só o Admin da plataforma grava.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 2097152, array['font/woff2', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy site_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'site' and private.is_platform_admin());
create policy site_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and private.is_platform_admin());
create policy site_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'site' and private.is_platform_admin())
  with check (bucket_id = 'site' and private.is_platform_admin());
create policy site_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site' and private.is_platform_admin());
