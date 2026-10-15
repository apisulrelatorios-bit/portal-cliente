# Status da Migração para Supabase Storage

## ✅ Concluído (13 arquivos)

**Bucket "site"** - Fontes e marca do site (leitura pública, escrita apenas Admin):
- 11 fontes WOFF2 (Poppins, Open Sans, Roboto)
- Logo da Apisul (PNG → WEBP, 50KB → 27KB)
- Ícone da Apisul (PNG → WEBP, 99KB → 23KB)
- **Total**: 258 KB
- **Status**: ✅ Enviados para Supabase Storage

## ⏳ Pendente (5 arquivos de conteúdo)

**Motivo**: As URLs originais do GitHub apontam para um repositório privado (portal-apisul/documentos) que retorna 404 quando acessadas publicamente.

**Solução**: Você precisa fazer upload manualmente destes 5 arquivos no portal:

### Arquivos para upload:

Localização: `C:\Users\Everton Leal\AppData\Local\Temp\claude\C--Users-Everton-Leal-OneDrive---Grupo-Apisul-Documentos-Sites-Portal-do-Cliente\7fad92d8-c890-4721-a63f-90d9df7209bb\scratchpad\ARQUIVOS_PARA_UPLOAD_MANUAL\`

| Arquivo | Tipo | Tamanho | Item Portal |
|---------|------|---------|------------|
| workshop-2026-4.pdf | PDF | 5.9 MB | Workshop 2026 |
| agosto-0-acidentes-1.png | PNG | 1.9 MB | Agosto 0 acidentes |
| mês-de-julho-perfeito-2.jpeg | JPEG | 433 KB | Mês de Julho Perfeito |
| record-de-meses-perfeitos-3.png | PNG | 1.9 MB | Record de meses perfeitos |
| impacto-criminal-no-rj-0.jpeg | JPEG | 438 KB | Impacto Criminal no RJ |

### Como fazer upload (passos):

1. Abra o Portal: https://portal-cliente-olive.vercel.app
2. Vá para **Conteúdos**
3. Para cada item acima:
   - Clique no item na lista
   - Clique em "Substituir por outra imagem" (ou no campo de link)
   - Clique em "Escolher arquivo"
   - Selecione o arquivo correspondente na pasta acima
   - Clique em "Salvar"

Após fazer upload dos 5 arquivos, eles estarão no Supabase Storage e as URLs do portal serão atualizadas automaticamente.

---

## Resumo da Migração

- **Data**: 15/10/2026
- **Total de arquivos**: 18 (13 site + 5 conteúdo)
- **Completed**: 13 ✅
- **Pending**: 5 ⏳
- **Supabase Buckets**:
  - `site` (leitura pública, escrita admin)
  - `arquivos` (privado, com RLS tenant-aware)
  - `thumbnails` (privado, com compressão automática)
  - `avatars` (privado, com compressão automática)
  - `logos` (privado, com compressão automática)

## Edge Function

- **Função**: `migracao-unica` (desativar após conclusão)
- **Status**: Criada, testada com sucesso para site
- **Ação**: Desativar manualmente após upload dos 5 arquivos
