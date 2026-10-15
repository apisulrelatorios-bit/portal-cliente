-- =====================================================================
-- Arquivos dos conteúdos (PDF, infográficos, Office, vídeos curtos):
-- bucket público "arquivos" — o card abre o arquivo pelo endereço e o
-- visualizador de PDF precisa de URL pública. Escrita só em
-- <tenant_id>/... pelo operador do cliente (mesma regra das capas).
-- Imagens chegam comprimidas pelo navegador; demais tipos vão como estão.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arquivos', 'arquivos', true, 52428800, array[
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy arquivos_select on storage.objects for select to authenticated
  using (bucket_id = 'arquivos' and private.pode_gravar_thumbnail(name));
create policy arquivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and private.pode_gravar_thumbnail(name));
create policy arquivos_update on storage.objects for update to authenticated
  using (bucket_id = 'arquivos' and private.pode_gravar_thumbnail(name))
  with check (bucket_id = 'arquivos' and private.pode_gravar_thumbnail(name));
create policy arquivos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and private.pode_gravar_thumbnail(name));
