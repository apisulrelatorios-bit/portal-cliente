-- =====================================================================
-- Criação de tenant a partir de um template (PRODUCT.md §4.2)
-- Só o Admin da plataforma (ou o backend, sem usuário logado) executa.
-- p_incluir_itens: copia também os itens de exemplo do template.
-- Padrão = false, para que um cliente novo nunca receba conteúdo de outro.
-- =====================================================================
create or replace function public.provisionar_tenant(
  p_nome          text,
  p_slug          text,
  p_template      text    default 'padrao-apisul',
  p_incluir_itens boolean default false,
  p_logo_url      text    default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid;
  v_lista    uuid;
  v_coluna   uuid;
  v_modulo   uuid;
  v_visao    uuid;
  v_listas   jsonb := '{}'::jsonb;
  tpl        record;
  l          jsonb;
  c          record;
  o          record;
  m          jsonb;
  a          record;
begin
  if auth.uid() is not null and not private.is_platform_admin() then
    raise exception 'Apenas administradores da plataforma podem criar tenants.' using errcode = '42501';
  end if;

  select * into tpl from public.templates where slug = p_template;
  if not found then
    raise exception 'Template "%" não encontrado.', p_template using errcode = 'P0002';
  end if;

  insert into public.tenants (slug, nome, logo_url, tema, telas, template_id)
  values (
    p_slug, p_nome, p_logo_url,
    coalesce(tpl.estrutura -> 'tema', '{}'::jsonb),
    coalesce(tpl.estrutura -> 'telas', '{"dashboard": true, "sinistros": true}'::jsonb),
    tpl.id
  )
  returning id into v_tenant;

  -- Listas, colunas e opções
  for l in select value from jsonb_array_elements(coalesce(tpl.estrutura -> 'listas', '[]'::jsonb)) loop
    insert into public.listas (tenant_id, slug, nome, descricao)
    values (v_tenant, l ->> 'slug', l ->> 'nome', l ->> 'descricao')
    returning id into v_lista;
    v_listas := v_listas || jsonb_build_object(l ->> 'slug', v_lista);

    for c in select value as col, ordinality from jsonb_array_elements(coalesce(l -> 'colunas', '[]'::jsonb)) with ordinality loop
      insert into public.colunas (tenant_id, lista_id, chave, rotulo, tipo, obrigatoria, padrao, ordem, oculta, config)
      values (
        v_tenant, v_lista,
        c.col ->> 'chave', c.col ->> 'rotulo', c.col ->> 'tipo',
        coalesce((c.col ->> 'obrigatoria')::boolean, false),
        c.col -> 'padrao',
        coalesce((c.col ->> 'ordem')::int, c.ordinality::int),
        coalesce((c.col ->> 'oculta')::boolean, false),
        coalesce(c.col -> 'config', '{}'::jsonb)
      )
      returning id into v_coluna;

      for o in select value as opt, ordinality from jsonb_array_elements(coalesce(c.col -> 'opcoes', '[]'::jsonb)) with ordinality loop
        insert into public.coluna_opcoes (tenant_id, coluna_id, valor, rotulo, cor, ordem)
        values (v_tenant, v_coluna, o.opt ->> 'valor', o.opt ->> 'rotulo', o.opt ->> 'cor', o.ordinality::int);
      end loop;
    end loop;

    if p_incluir_itens then
      insert into public.itens (tenant_id, lista_id, dados)
      select v_tenant, v_lista, value
      from jsonb_array_elements(coalesce(l -> 'itens', '[]'::jsonb));
    end if;
  end loop;

  -- Módulos, abas e a visão de cada aba
  for m in select value from jsonb_array_elements(coalesce(tpl.estrutura -> 'modulos', '[]'::jsonb)) loop
    insert into public.modulos (tenant_id, slug, nome, icone, ordem)
    values (v_tenant, m ->> 'slug', m ->> 'nome', m ->> 'icone', coalesce((m ->> 'ordem')::int, 0))
    returning id into v_modulo;

    for a in select value as aba, ordinality from jsonb_array_elements(coalesce(m -> 'abas', '[]'::jsonb)) with ordinality loop
      v_visao := null;
      if a.aba ? 'lista' then
        insert into public.visoes (tenant_id, lista_id, nome, config)
        values (
          v_tenant,
          (v_listas ->> (a.aba ->> 'lista'))::uuid,
          (m ->> 'nome') || ' · ' || (a.aba ->> 'nome'),
          coalesce(a.aba -> 'visao', '{}'::jsonb)
        )
        returning id into v_visao;
      end if;

      insert into public.abas (tenant_id, modulo_id, nome, ordem, visao_id)
      values (v_tenant, v_modulo, a.aba ->> 'nome', a.ordinality::int, v_visao);
    end loop;
  end loop;

  return v_tenant;
end;
$$;

revoke all on function public.provisionar_tenant(text, text, text, boolean, text) from public, anon;
grant execute on function public.provisionar_tenant(text, text, text, boolean, text) to authenticated, service_role;
