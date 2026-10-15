-- Índices que cobrem as chaves estrangeiras compostas (id, tenant_id).
drop index if exists public.itens_lista_id_idx;
drop index if exists public.abas_modulo_id_idx;
drop index if exists public.abas_visao_id_idx;

create index colunas_lista_tenant_idx       on public.colunas (lista_id, tenant_id);
create index coluna_opcoes_coluna_tenant_idx on public.coluna_opcoes (coluna_id, tenant_id);
create index itens_lista_tenant_idx         on public.itens (lista_id, tenant_id);
create index visoes_lista_tenant_idx        on public.visoes (lista_id, tenant_id);
create index abas_modulo_tenant_idx         on public.abas (modulo_id, tenant_id);
create index abas_visao_tenant_idx          on public.abas (visao_id, tenant_id);
