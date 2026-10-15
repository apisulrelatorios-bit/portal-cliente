# Portal de Gestão & Performance — Produto

> Documento vivo. Define o que o produto é, quem usa, como os dados são organizados e em que ordem vamos construir.
> Status: **em implementação** (fases 0, 1, 2 e 5 concluídas) · Migrations em `supabase/migrations/` · Última revisão: 2026-10-14

---

## 1. Visão

Um portal multi-cliente (multi-tenant) operado pela Apisul. Cada cliente (Mondelez, White Martins, …) tem um espaço isolado, com as suas cores, os seus usuários, os seus módulos e as suas listas de dados.

As listas funcionam **como listas do SharePoint**: o operador define colunas, tipos e opções de escolha, e pode mudar isso a qualquer momento sem precisar de desenvolvedor.

Substitui o modelo atual (Power Automate + listas no site `SinistrosApisul` do SharePoint) por um backend próprio no **Supabase** (Auth + Postgres + Storage + Edge Functions), com o front publicado na **Vercel**.

### Por que sair do modelo atual
- A "sessão" de hoje é só uma flag no navegador (`sessionStorage.portalAutenticado = "true"`). Qualquer um consegue forjá-la pelo console.
- A URL assinada do fluxo do Power Automate está exposta no JavaScript público.
- O fluxo devolve todos os itens de uma vez. Não há permissão por linha, por tenant nem por perfil.
- Cada cliente novo exige mexer em listas, fluxos e HTML na mão.

---

## 2. Perfis de usuário

| Perfil | Escopo | Pode fazer |
|---|---|---|
| **Admin** (Apisul) | Plataforma inteira | Usa **só a Administração**: cria e desativa tenants (contas), cria operadores e clientes em qualquer tenant, define o template inicial. **Não entra nos portais dos clientes**, a menos que também tenha vínculo com o cliente. |
| **Operador** | Um ou mais tenants | Cadastra, edita e remove itens das listas. Libera acesso para usuários do tipo **Cliente**. Se tiver a permissão *"Pode configurar o tenant"*: cria e edita listas, colunas, opções de escolha, módulos, abas, cores e visibilidade de telas. |
| **Cliente** | Um ou mais tenants | Só visualiza os módulos e abas visíveis do tenant. |

Regras:
- **Um usuário pode pertencer a vários tenants** e ter perfis diferentes em cada um (ex.: operador na Mondelez e cliente na White Martins).
- *"Pode configurar o tenant"* é uma flag por vínculo (usuário × tenant), ligada ou desligada pelo Admin. Assim, um operador pode ou não mexer na estrutura do cliente dele.
- Admin é um papel global (fora de qualquer tenant).

---

## 3. Login e acesso

- **Identificador flexível**: o usuário pode ser cadastrado **com e-mail, com nome de usuário ou com os dois**. Na tela de login há um campo único, "E-mail ou usuário".
  - Cadastrado só com usuário: guardamos um e-mail técnico interno (`<usuario>@usuarios.portal.internal`) no Supabase Auth, que nunca aparece na tela. Esse usuário não recebe e-mail de recuperação; quem redefine a senha é o operador ou o admin.
  - Cadastrado com e-mail: recuperação de senha por e-mail normal.
- **Direcionamento pelo login**: não há subdomínio nem caminho por cliente. Depois de autenticar:
  - se o usuário tem 1 tenant, vai direto para o dashboard dele;
  - se tem mais de 1, aparece um seletor de tenant, que pode ser trocado depois no menu do usuário.
- Sessão via JWT do Supabase. Toda leitura e escrita passa por **RLS** (Row Level Security) no banco, e nada depende de flags no navegador.
- Senhas atuais (`SenhaHash` no SharePoint) **não são migráveis**. Na migração, cada usuário recebe uma senha provisória ou um link de definição de senha.

---

## 4. Estrutura do tenant

```
Tenant (Mondelez)
├── Identidade: nome, logo, cores (primária, secundária, fundo, texto…)
├── Configuração de telas: Dashboard ✓ · Sinistros ✗ · GR ✓ · GL ✓ …
├── Módulos (páginas do menu lateral)
│   ├── GR                      ← nome livre ("Administrativo", "Qualidade"…)
│   │   ├── Aba "Segurança"     ← cada aba mostra uma visão de uma lista
│   │   ├── Aba "Temperatura"
│   │   └── Aba "Auditoria"
│   └── GL
│       └── …
└── Listas (como no SharePoint)
    ├── Itens do Portal  → colunas: Título, Tipo de documento, Categoria, Tema, UrlLink, Thumbnail, Ativo…
    └── (outras listas criadas pelo operador)
```

### 4.1 Módulos e abas
- O tenant escolhe **quais módulos existem** e **como se chamam**: GR, GL, "Administrativo", o nome que quiser.
- Cada módulo tem **abas**. Cada aba aponta para uma **visão** de uma lista (filtro + ordenação + agrupamento + forma de exibição).
- Exemplo do GR atual: a aba "Segurança" é a lista *Itens do Portal* filtrada por `Módulo = GR` e `Categoria = Segurança`, agrupada por `Tema` e exibida como **cards**.
- **Telas de sistema** (Dashboard, Sinistros) sempre existem no código, mas cada tenant liga ou desliga a visibilidade delas na configuração.

### 4.2 Listas no estilo SharePoint
- Uma lista tem **colunas** definidas pelo operador:

| Tipo de coluna | Exemplo |
|---|---|
| Texto / Texto longo | Título, Descrição |
| Número / Moeda / Porcentagem | Valor do sinistro |
| Data / Data e hora | Data de publicação |
| **Escolha** / **Escolha múltipla** | Tipo de documento: PDF, Vídeo, Power BI… |
| Sim/Não | Ativo |
| Link / Imagem / Arquivo | UrlLink, Thumbnail, anexo |
| Pessoa (usuário do tenant) | Responsável |
| Pesquisa (lookup em outra lista) | Categoria → lista *Categorias* |

- **Opções de escolha são editáveis**: o operador adiciona, renomeia, reordena, colore e desativa opções. Uma opção desativada não aparece para novos itens, mas é preservada nos itens antigos.
- Colunas podem ser obrigatórias, ter valor padrão, ser ocultadas e reordenadas.
- **Templates**: todo tenant nasce a partir de um template (ex.: "Padrão Apisul", com a lista *Itens do Portal* e os módulos GR/GL). A partir daí o tenant evolui sozinho, e mudanças nele não afetam o template nem os outros tenants.

### 4.3 Visões (como as "views" do SharePoint)
Uma visão define:
- colunas visíveis e a ordem delas;
- filtros (ex.: `Ativo = Sim`, `Módulo = GR`);
- ordenação e agrupamento (ex.: agrupar por Categoria → Tema);
- **forma de exibição**: `cards` (como GR/GL hoje), `tabela`, `galeria` e, no futuro, `gráfico`.

### 4.4 Template "Padrão Apisul" (implantado)
Todo tenant novo nasce dele. A origem é a planilha padrão mais a lista *Itens do Portal* do SharePoint.

**Lista *Itens do Portal*** (`itens-do-portal`):

| Chave | Coluna | Tipo | Obrig. | Padrão / opções |
|---|---|---|---|---|
| `titulo` | Título | texto | ✓ | |
| `vertente` | Vertente | escolha múltipla | ✓ | GR, GL (o antigo "AMBOS" vira [GR, GL]) |
| `categoria` | Categoria | escolha | ✓ | Indicadores, Documentos, Treinamentos, Newsletter, Report, Awards |
| `tema` | Tema | escolha | ✓ | Controle de Temperatura, Falta na Entrega, Safety, Operacional, CCR |
| `tipo_midia` | Tipo de mídia | escolha | ✓ | powerbi, pdf, infografico, video, link_externo, ppt, word, excel |
| `descricao` | Descrição | texto longo | | |
| `ordem_exibicao` | Ordem de exibição | número | | 1 |
| `url_link` | Link | link | | |
| `thumbnail` | Thumbnail | imagem | | |
| `thumbnail_modo` | Modo do thumbnail | escolha | | Automático, Manual (padrão Automático) |
| `status_thumbnail` | Status do thumbnail | texto | | Pendente |
| `url_link_processado` | Link processado | texto (oculta) | | |
| `ativo` | Ativo | sim/não | ✓ | Sim |

**Módulos**: GR e GL, cada um com 6 abas (uma por Categoria). Cada aba é uma visão em cards, filtrada por Vertente + Categoria + Ativo, agrupada por Tema e ordenada por Ordem de exibição → Título.

**Criação de tenant**: `select provisionar_tenant('Nome', 'slug')`.
- Copia listas, colunas, opções, módulos, abas e visões.
- Os itens de exemplo do template **só são copiados com `p_incluir_itens => true`**. O padrão é não copiar, para que um cliente novo nunca receba conteúdo (links de Power BI) de outro.

---

## 5. Modelo de dados (Supabase / Postgres)

Todas as tabelas de negócio têm `tenant_id` e RLS habilitado.

| Tabela | Conteúdo principal |
|---|---|
| `tenants` | id, nome, slug, logo_url, tema (jsonb de cores), telas_visiveis (jsonb), ativo, template_id |
| `profiles` | id (= auth.users.id), nome, username (único, opcional), email (real, opcional), foto_url, is_platform_admin |
| `memberships` | user_id, tenant_id, papel (`operador` \| `cliente`), pode_configurar (bool), ativo |
| `modulos` | tenant_id, nome, slug, ícone, ordem, visível |
| `abas` | modulo_id, nome, ordem, visao_id |
| `listas` | tenant_id, nome, slug, descrição |
| `colunas` | lista_id, chave interna, rótulo, tipo, obrigatória, padrão, ordem, oculta, config (jsonb) |
| `coluna_opcoes` | coluna_id, valor, rótulo, cor, ordem, ativa (para Escolha / Escolha múltipla) |
| `itens` | lista_id, tenant_id, **dados (jsonb)**, criado_por, atualizado_por, timestamps |
| `visoes` | lista_id, nome, colunas, filtros, ordenação, agrupamento, exibição (jsonb) |
| `templates` | nome, estrutura (jsonb com listas, colunas, opções, módulos, abas) |
| `auditoria` *(a criar)* | tenant_id, user_id, ação, entidade, antes/depois (jsonb), quando |

Notas:
- Os valores de cada item ficam em `itens.dados` (jsonb), com chave = `colunas.chave`. É isso que permite cada cliente ter colunas diferentes sem criar tabelas novas.
- A validação de tipo e de campos obrigatórios roda em uma função no banco (trigger), não só no front.
- Índices GIN em `itens.dados` para filtros e buscas.

### 5.1 Segurança (RLS)
Funções auxiliares: `is_platform_admin()`, `is_member(tenant_id)`, `has_role(tenant_id, papel)`, `can_configure(tenant_id)`.

| Recurso | Ler | Escrever |
|---|---|---|
| tenants | membros + admin | admin (identidade/cores: operador com `pode_configurar`) |
| listas, colunas, opções, módulos, abas, visões | membros | operador com `pode_configurar` + admin |
| itens | membros (cliente só vê itens ativos e abas visíveis) | operador + admin |
| memberships | o próprio usuário, operadores do tenant, admin | operador (só cria `cliente`) + admin |

### 5.2 Storage
- Bucket privado `tenant-files/{tenant_id}/…` para logos, thumbnails e anexos, acessado por URL assinada.
- As políticas de acesso usam o mesmo `is_member(tenant_id)`.

### 5.3 Edge Functions
- `admin-users`: cria e convida usuários, redefine senhas e cria vínculos. Precisa da service key, por isso nunca roda no navegador.
- `tenant-provision`: cria um tenant novo a partir de um template.
- `thumbnail-proxy`: baixa PDFs externos para gerar o thumbnail (ver seção 7).

---

## 6. Telas

**Portal (Cliente / Operador)**
- Login (e-mail ou usuário) → seletor de tenant (se houver mais de um) → Dashboard.
- Menu lateral montado a partir dos `modulos` visíveis + telas de sistema habilitadas.
- Módulo → abas → visão (cards / tabela).
- Para o operador: botões de novo / editar / excluir item direto na visão.

**Configuração do tenant** (operador com `pode_configurar`)
- Identidade: logo e cores.
- Telas: liga e desliga Dashboard, Sinistros e módulos.
- Módulos e abas: criar, renomear, reordenar.
- Listas: colunas, tipos, opções de escolha, visões.
- Usuários: convidar e desativar usuários **Cliente**.

**Console do Admin** (plataforma)
- Tenants: criar (a partir de template), desativar, editar.
- Usuários: criar operadores e clientes, vincular a tenants, ligar `pode_configurar`.
- Templates: editar o template padrão.

---

## 7. Thumbnails — semiautomático

Hoje: fluxo no Power Automate (`ThumbnailFlow-Copilot.md`) que gera PNG a partir do UrlLink e publica no GitHub `portal-apisul/documentos/thumbnail`.

No novo modelo, **todo thumbnail é semiautomático**. Ao lançar a linha, o sistema detecta o tipo do link ou arquivo e decide:
- **Automático**: o próprio sistema gera a imagem, e o formulário já mostra a prévia com o selo **"Thumbnail gerado automaticamente"**.
- **Manual**: o formulário pede que o operador **tire um print e faça o upload da imagem** junto com a linha.

Sem serviços externos pagos. Os thumbnails ficam só no **Supabase Storage** (`tenant-files/{tenant}/thumbnails/{item_id}.webp`), e o GitHub deixa de ser usado.

### 7.1 Divisão por tipo

| Tipo detectado | Modo | Como funciona |
|---|---|---|
| Imagem (jpg, jpeg, png, gif, webp, svg) | **Automático** | Usa a própria imagem, redimensionada e convertida para webp |
| PDF (arquivo enviado ou link público) | **Automático** | Renderiza a 1ª página no navegador do operador (pdf.js) |
| Vídeo YouTube / Vimeo | **Automático** | Usa a capa pública do próprio provedor |
| Vídeo enviado (mp4, webm) | **Automático** | Captura um quadro do vídeo no navegador |
| Power BI | **Manual** | Print do relatório + upload |
| Website / link HTML | **Manual** | Print da página + upload |
| Word, Excel, PowerPoint | **Manual** | Print da 1ª página/slide + upload |
| Link do SharePoint/OneDrive que exige login | **Manual** | O sistema não consegue abrir o arquivo; print + upload |
| Qualquer outro / tipo desconhecido | **Manual** | Print + upload |

Regras de fallback:
- Se um tipo automático **falhar** (link quebrado, PDF protegido, sem permissão de leitura), a linha muda sozinha para **Manual** e o formulário pede o print, mostrando o motivo do erro.
- PDF em link externo que bloqueia leitura direta (CORS): a Edge Function `thumbnail-proxy` baixa o arquivo no servidor e o devolve ao navegador para renderizar. Se nem assim abrir, cai para Manual.

### 7.2 Como aparece na tela (formulário de lançamento)

1. O operador cola o link ou envia o arquivo.
2. O sistema detecta o tipo e mostra um destes estados:
   - 🟢 **Thumbnail gerado automaticamente**: prévia da imagem. Botão opcional *"Substituir por outra imagem"*.
   - 🟡 **Thumbnail manual: envie um print**: campo de upload (arrastar, colar com Ctrl+V ou escolher arquivo), com uma dica do que fotografar (ex.: "Abra o relatório do Power BI, tire um print da página principal e cole aqui").
   - 🔴 **Não foi possível gerar automaticamente**: motivo do erro + o mesmo campo de upload do modo manual.
3. Ao salvar sem print em um item manual, a linha é salva com o status **Pendente**, e o card mostra um placeholder com o ícone do tipo. Os operadores têm um filtro "Thumbnails pendentes" para completar depois.

Para quem só visualiza (perfil Cliente), o card mostra só a imagem. Os selos de modo e status aparecem apenas para operador e admin.

### 7.3 Colunas de controle (lista *Itens do Portal*)

| Coluna | Valores |
|---|---|
| `Thumbnail` | imagem no Storage |
| `ThumbnailModo` | `Automático` · `Manual` |
| `StatusThumbnail` | `Gerado automaticamente` · `Enviado manualmente` · `Pendente` · `Erro: <motivo>` |
| `UrlLink_Processado` | último UrlLink para o qual o thumbnail foi gerado |

Regras mantidas do fluxo atual:
- Só reprocessar quando `UrlLink` mudar ou o `Thumbnail` estiver vazio. Mudanças em outros campos não disparam nada.
- Se o operador enviar uma imagem manualmente em um item automático, o modo vira `Manual` e o sistema não sobrescreve mais aquela imagem. Para voltar ao automático, há o botão *"Gerar automaticamente de novo"*.
- Se o `UrlLink` mudar em um item manual, o status volta para `Pendente` e o print antigo é mantido até ser substituído.

### 7.4 Evolução futura (fora do escopo agora)
Website, Power BI e Office podem virar automáticos se, no futuro, contratarmos um serviço de screenshot ou conversão de documentos. A estrutura acima já suporta isso: basta trocar o modo do tipo de Manual para Automático.

---

## 8. Migração do SharePoint

Fontes atuais (site *SinistrosApisul* no SharePoint da Apisul):
- **Usuários**: Login, SenhaHash, NomeContato, Foto, Cliente, Vertente
- **Clientes**: Title, LogoUrl, Ativo
- **Itens do Portal**: Título, Vertente, Categoria, Tema, TipoMídia, UrlLink, Link_thumbnail, Ativo…

Plano:
1. Exportar as listas (CSV/Excel) → script de importação.
2. Cada Cliente vira um tenant; Vertente vira módulo; Categoria vira aba; Tema vira agrupamento.
3. Usuários são criados sem senha e recebem senha provisória ou link de definição.
4. Itens são importados em *Itens do Portal*, e os thumbnails são copiados para o Storage.

Status (2026-10-14): **Itens do Portal migrados**. O tenant `mondelez` foi criado com os 14 itens, e os links e thumbnails continuam apontando para o GitHub. Faltam os usuários (lista *UsuariosPortal*: Mondelez e Coty) e a cópia dos thumbnails para o Storage.

Ponto a decidir: o processo semiautomático de cadastro de itens que o Everton vai detalhar.

---

## 9. Fases de entrega

| Fase | Entrega |
|---|---|
| **0 — Fundação** ✅ | Schema, RLS, validação de itens, template "Padrão Apisul", tenant Mondelez com os 14 itens (Storage ainda pendente) |
| **1 — Login e shell** ✅ | Login com e-mail ou usuário, seletor de tenant, menu dinâmico (cores do tenant ainda pendentes) |
| **2 — GR / GL no Supabase** ✅ | `modulo.html?modulo=<slug>`: abas → visão em cards, lendo de `itens`; gr.html/gl.html redirecionam |
| **3 — Operação** ✅ | `usuarios.html` (usuários Cliente) e `conteudos.html` (tabela + formulário gerado pelas colunas da lista: criar, editar, excluir) |
| **4 — Configuração do tenant** | Editor de listas, colunas, opções, módulos, abas, telas e cores |
| **5 — Console Admin** ✅ | `admin.html`: clientes (criar por template, editar, ativar) e usuários (criar, vínculos, senha, bloqueio, Admin) via Edge Function `admin-usuarios` |
| **6 — Thumbnails** ✅ | Em `conteudos.html`: imagem/YouTube/Vimeo/PDF/vídeo automáticos (PDF via pdf.js no navegador); Power BI/site/Office pedem print (arrastar, Ctrl+V ou arquivo); filtro "Thumbnail pendente"; capas no bucket `thumbnails/<tenant_id>/` |
| **7 — Dashboard e Sinistros** | Migrar as telas de sistema para o novo modelo |
| **8 — Migração e corte** | Importar dados do SharePoint, publicar na Vercel, desligar os fluxos |

---

## 10. Fora do escopo (por enquanto)
- Domínio ou subdomínio próprio por cliente.
- Personalização além de logo e cores (fontes, layout).
- Permissões por usuário individual em módulos (hoje a visibilidade é por tenant).

## 11. Decisões registradas
| # | Decisão |
|---|---|
| 1 | Supabase: projeto `hqxkqzhioilnrvmaylgy` (vazio em 2026-10-14) |
| 2 | Login por e-mail **ou** usuário, conforme o cadastro |
| 3 | Um usuário pode estar em vários tenants |
| 4 | O tenant é definido pelo login (sem subdomínio) |
| 5 | Listas e colunas no estilo SharePoint, com opções editáveis; o tenant nasce de um template |
| 6 | Módulos com nome livre e abas por módulo |
| 7 | Dashboard e Sinistros existem; a visibilidade é configurável por tenant |
| 8 | Identidade visual = logo + cores |
| 9 | Haverá migração do conteúdo atual |
| 10 | Hospedagem na Vercel |
| 11 | Thumbnails semiautomáticos: imagem, PDF e vídeo automáticos; Power BI, site e Office manuais (print + upload); sem serviço pago; só Supabase Storage |
| 12 | Template "Padrão Apisul" = planilha padrão; tenants novos nascem sem itens, salvo pedido explícito |
| 13 | Identidade (nome e logo) é configurada **dentro do cliente**, em `configuracoes.html`, pelo operador com "pode configurar". O Admin só dá o nome inicial; a Administração mostra a identidade da plataforma (Grupo Apisul). Logos ficam no Storage, bucket `logos/<tenant_id>/` |
| 14 | Admin da plataforma acessa só a Administração; portais de cliente exigem vínculo (Operador ou Cliente) |
