-- =====================================================================
-- Thumbnails dos conteúdos (PRODUCT.md §7): bucket público "thumbnails".
-- Leitura aberta (a capa aparece no card); escrita só em <tenant_id>/...
-- por operador do cliente (ou Admin).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thumbnails', 'thumbnails', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.pode_gravar_thumbnail(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (storage.foldername(p_nome))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_operador(((storage.foldername(p_nome))[1])::uuid)
    else false
  end;
$$;
revoke all on function private.pode_gravar_thumbnail(text) from public, anon;
grant execute on function private.pode_gravar_thumbnail(text) to authenticated;

create policy thumbnails_select on storage.objects for select to authenticated
  using (bucket_id = 'thumbnails' and private.pode_gravar_thumbnail(name));
create policy thumbnails_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbnails' and private.pode_gravar_thumbnail(name));
create policy thumbnails_update on storage.objects for update to authenticated
  using (bucket_id = 'thumbnails' and private.pode_gravar_thumbnail(name))
  with check (bucket_id = 'thumbnails' and private.pode_gravar_thumbnail(name));
create policy thumbnails_delete on storage.objects for delete to authenticated
  using (bucket_id = 'thumbnails' and private.pode_gravar_thumbnail(name));
