-- =====================================================================
-- Portal de Gestão & Performance — schema base multi-tenant
-- Perfis: Admin (plataforma) · Operador · Cliente   (ver PRODUCT.md §2)
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Utilitário: updated_at
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nome              text not null default '',
  username          text,
  email             text,
  foto_url          text,
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username)) where username is not null;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Cria o perfil automaticamente quando um usuário é criado no Auth.
-- Usuários cadastrados só com "usuário" recebem um e-mail técnico
-- (@usuarios.portal.internal) que não é exposto como e-mail real.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    nullif(new.raw_user_meta_data ->> 'username', ''),
    case when new.email ilike '%@usuarios.portal.internal' then null else new.email end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Templates e tenants
-- ---------------------------------------------------------------------
create table public.templates (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  nome       text not null,
  descricao  text,
  estrutura  jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger templates_updated_at before update on public.templates
  for each row execute function private.set_updated_at();

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome        text not null,
  logo_url    text,
  tema        jsonb not null default '{}'::jsonb,
  telas       jsonb not null default '{"dashboard": true, "sinistros": true}'::jsonb,
  ativo       boolean not null default true,
  template_id uuid references public.templates (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tenants_template_id_idx on public.tenants (template_id);
create trigger tenants_updated_at before update on public.tenants
  for each row execute function private.set_updated_at();

create type public.papel_tenant as enum ('operador', 'cliente');

create table public.memberships (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  papel           public.papel_tenant not null default 'cliente',
  pode_configurar boolean not null default false,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  primary key (user_id, tenant_id),
  check (papel = 'operador' or not pode_configurar)
);
create index memberships_tenant_id_idx on public.memberships (tenant_id);

-- ---------------------------------------------------------------------
-- Listas no estilo SharePoint
-- ---------------------------------------------------------------------
create table public.listas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  slug       text not null,
  nome       text not null,
  descricao  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (id, tenant_id)
);
create trigger listas_updated_at before update on public.listas
  for each row execute function private.set_updated_at();

create table public.colunas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  lista_id    uuid not null,
  chave       text not null check (chave ~ '^[a-z][a-z0-9_]*$'),
  rotulo      text not null,
  tipo        text not null check (tipo in (
                'texto', 'texto_longo', 'numero', 'moeda', 'porcentagem',
                'data', 'data_hora', 'escolha', 'escolha_multipla', 'sim_nao',
                'link', 'imagem', 'arquivo', 'pessoa', 'pesquisa')),
  obrigatoria boolean not null default false,
  padrao      jsonb,
  ordem       integer not null default 0,
  oculta      boolean not null default false,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (lista_id, chave),
  unique (id, tenant_id),
  foreign key (lista_id, tenant_id) references public.listas (id, tenant_id) on delete cascade
);
create index colunas_tenant_id_idx on public.colunas (tenant_id);
create trigger colunas_updated_at before update on public.colunas
  for each row execute function private.set_updated_at();

create table public.coluna_opcoes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  coluna_id  uuid not null,
  valor      text not null,
  rotulo     text,
  cor        text,
  ordem      integer not null default 0,
  ativa      boolean not null default true,
  created_at timestamptz not null default now(),
  unique (coluna_id, valor),
  foreign key (coluna_id, tenant_id) references public.colunas (id, tenant_id) on delete cascade
);
create index coluna_opcoes_tenant_id_idx on public.coluna_opcoes (tenant_id);

create table public.itens (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  lista_id       uuid not null,
  dados          jsonb not null default '{}'::jsonb,
  criado_por     uuid references public.profiles (id) on delete set null default auth.uid(),
  atualizado_por uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (lista_id, tenant_id) references public.listas (id, tenant_id) on delete cascade
);
create index itens_lista_id_idx on public.itens (lista_id);
create index itens_tenant_id_idx on public.itens (tenant_id);
create index itens_criado_por_idx on public.itens (criado_por);
create index itens_atualizado_por_idx on public.itens (atualizado_por);
create index itens_dados_idx on public.itens using gin (dados jsonb_path_ops);

create table public.visoes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  lista_id   uuid not null,
  nome       text not null,
  config     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (lista_id, tenant_id) references public.listas (id, tenant_id) on delete cascade
);
create index visoes_tenant_id_idx on public.visoes (tenant_id);
create trigger visoes_updated_at before update on public.visoes
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Módulos (páginas do menu) e abas
-- ---------------------------------------------------------------------
create table public.modulos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome       text not null,
  icone      text,
  ordem      integer not null default 0,
  visivel    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (id, tenant_id)
);
create trigger modulos_updated_at before update on public.modulos
  for each row execute function private.set_updated_at();

create table public.abas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  modulo_id  uuid not null,
  nome       text not null,
  ordem      integer not null default 0,
  visivel    boolean not null default true,
  visao_id   uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (modulo_id, tenant_id) references public.modulos (id, tenant_id) on delete cascade,
  foreign key (visao_id, tenant_id) references public.visoes (id, tenant_id) on delete set null (visao_id)
);
create index abas_tenant_id_idx on public.abas (tenant_id);
create index abas_modulo_id_idx on public.abas (modulo_id);
create index abas_visao_id_idx on public.abas (visao_id);
create trigger abas_updated_at before update on public.abas
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Funções de permissão (usadas pelo RLS)
-- ---------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function private.papel_no_tenant(p_tenant uuid)
returns public.papel_tenant
language sql stable security definer
set search_path = ''
as $$
  select m.papel
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.ativo and t.ativo;
$$;

create or replace function private.is_member(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_platform_admin() or private.papel_no_tenant(p_tenant) is not null;
$$;

create or replace function private.is_operador(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_platform_admin() or private.papel_no_tenant(p_tenant) = 'operador';
$$;

create or replace function private.can_configure(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1
    from public.memberships m
    join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant and m.user_id = auth.uid()
      and m.ativo and t.ativo and m.papel = 'operador' and m.pode_configurar
  );
$$;

-- O usuário logado é operador em algum tenant do qual p_user também participa?
create or replace function private.operador_de(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships alvo
    join public.memberships eu on eu.tenant_id = alvo.tenant_id
    where alvo.user_id = p_user and eu.user_id = auth.uid()
      and eu.papel = 'operador' and eu.ativo
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Validação dos itens contra as colunas da lista
-- ---------------------------------------------------------------------
create or replace function private.validar_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        record;
  k        text;
  v        jsonb;
  elem     jsonb;
  anterior jsonb;
begin
  if jsonb_typeof(new.dados) <> 'object' then
    raise exception 'dados deve ser um objeto JSON' using errcode = '22023';
  end if;

  for k in select jsonb_object_keys(new.dados) loop
    if not exists (select 1 from public.colunas where lista_id = new.lista_id and chave = k) then
      raise exception 'Coluna desconhecida: %', k using errcode = '22023';
    end if;
  end loop;

  for c in select * from public.colunas where lista_id = new.lista_id order by ordem loop
    v := new.dados -> c.chave;
    anterior := case when tg_op = 'UPDATE' then old.dados -> c.chave end;

    if v is null or v = any (array['null'::jsonb, '""'::jsonb, '[]'::jsonb]) then
      if tg_op = 'INSERT' and c.padrao is not null then
        new.dados := new.dados || jsonb_build_object(c.chave, c.padrao);
        v := c.padrao;
      elsif c.obrigatoria then
        raise exception 'O campo "%" é obrigatório.', c.rotulo using errcode = '23502';
      else
        continue;
      end if;
    end if;

    if c.tipo in ('numero', 'moeda', 'porcentagem') and jsonb_typeof(v) <> 'number' then
      raise exception 'O campo "%" deve ser numérico.', c.rotulo using errcode = '22023';
    elsif c.tipo = 'sim_nao' and jsonb_typeof(v) <> 'boolean' then
      raise exception 'O campo "%" deve ser Sim/Não.', c.rotulo using errcode = '22023';
    elsif c.tipo in ('data', 'data_hora') then
      begin
        perform (v #>> '{}')::timestamptz;
      exception when others then
        raise exception 'O campo "%" deve ser uma data válida.', c.rotulo using errcode = '22023';
      end;
    elsif c.tipo = 'escolha' then
      -- Opção desativada continua válida em itens que já a tinham.
      if jsonb_typeof(v) <> 'string' or not exists (
        select 1 from public.coluna_opcoes o
        where o.coluna_id = c.id and o.valor = v #>> '{}'
          and (o.ativa or anterior = v)
      ) then
        raise exception 'Valor inválido para "%": %', c.rotulo, v using errcode = '22023';
      end if;
    elsif c.tipo = 'escolha_multipla' then
      if jsonb_typeof(v) <> 'array' then
        raise exception 'O campo "%" deve ser uma lista de opções.', c.rotulo using errcode = '22023';
      end if;
      for elem in select jsonb_array_elements(v) loop
        if not exists (
          select 1 from public.coluna_opcoes o
          where o.coluna_id = c.id and o.valor = elem #>> '{}'
            and (o.ativa or coalesce(anterior @> jsonb_build_array(elem), false))
        ) then
          raise exception 'Valor inválido para "%": %', c.rotulo, elem using errcode = '22023';
        end if;
      end loop;
    end if;
  end loop;

  new.atualizado_por := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.validar_item() from public, anon, authenticated;

create trigger itens_validar before insert or update on public.itens
  for each row execute function private.validar_item();

-- ---------------------------------------------------------------------
-- Privilégios: anon não acessa nada; colunas sensíveis protegidas
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.templates, public.tenants, public.memberships,
  public.listas, public.colunas, public.coluna_opcoes, public.itens, public.visoes,
  public.modulos, public.abas from anon;

-- Perfil: usuário só altera nome e foto (nunca is_platform_admin).
revoke update on public.profiles from authenticated;
grant update (nome, foto_url) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;

-- Tenant: operador com permissão altera só identidade e telas.
-- Criação, nome e ativação passam pelas funções de admin.
revoke insert, update, delete on public.tenants from authenticated;
grant update (logo_url, tema, telas) on public.tenants to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.templates     enable row level security;
alter table public.tenants       enable row level security;
alter table public.memberships   enable row level security;
alter table public.listas        enable row level security;
alter table public.colunas       enable row level security;
alter table public.coluna_opcoes enable row level security;
alter table public.itens         enable row level security;
alter table public.visoes        enable row level security;
alter table public.modulos       enable row level security;
alter table public.abas          enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_platform_admin() or private.operador_de(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_platform_admin())
  with check (id = (select auth.uid()) or private.is_platform_admin());

-- templates: só admin
create policy templates_select on public.templates for select to authenticated
  using (private.is_platform_admin());
create policy templates_insert on public.templates for insert to authenticated
  with check (private.is_platform_admin());
create policy templates_update on public.templates for update to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy templates_delete on public.templates for delete to authenticated
  using (private.is_platform_admin());

-- tenants
create policy tenants_select on public.tenants for select to authenticated
  using (private.is_member(id));
create policy tenants_update on public.tenants for update to authenticated
  using (private.can_configure(id)) with check (private.can_configure(id));

-- memberships: operador gerencia apenas usuários do tipo cliente
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or private.is_operador(tenant_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (private.is_platform_admin()
              or (private.is_operador(tenant_id) and papel = 'cliente' and not pode_configurar));
create policy memberships_update on public.memberships for update to authenticated
  using (private.is_platform_admin() or (private.is_operador(tenant_id) and papel = 'cliente'))
  with check (private.is_platform_admin()
              or (private.is_operador(tenant_id) and papel = 'cliente' and not pode_configurar));
create policy memberships_delete on public.memberships for delete to authenticated
  using (private.is_platform_admin() or (private.is_operador(tenant_id) and papel = 'cliente'));

-- Estrutura do tenant: membros leem, quem pode configurar escreve.
do $$
declare
  t text;
begin
  foreach t in array array['listas', 'colunas', 'coluna_opcoes', 'visoes', 'modulos', 'abas'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (private.is_member(tenant_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (private.can_configure(tenant_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (private.can_configure(tenant_id)) with check (private.can_configure(tenant_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (private.can_configure(tenant_id))', t);
  end loop;
end;
$$;

-- itens: operador vê tudo e escreve; cliente vê só itens ativos.
create policy itens_select on public.itens for select to authenticated
  using (private.is_operador(tenant_id)
         or (private.is_member(tenant_id) and coalesce((dados ->> 'ativo')::boolean, true)));
create policy itens_insert on public.itens for insert to authenticated
  with check (private.is_operador(tenant_id));
create policy itens_update on public.itens for update to authenticated
  using (private.is_operador(tenant_id)) with check (private.is_operador(tenant_id));
create policy itens_delete on public.itens for delete to authenticated
  using (private.is_operador(tenant_id));
