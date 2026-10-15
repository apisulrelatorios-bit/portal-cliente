# Guia: Novo Componente de Filtros Moderno

## Visão Geral

O novo componente `FiltrosModerno` oferece uma interface moderna e intuitiva para filtros com chips/buttons, similar ao design apresentado.

**Arquivos criados:**
- `css/filtros-moderno.css` - Estilos
- `js/filtros-moderno.js` - Lógica do componente

---

## Características

✅ **Interface moderna com chips**
✅ **Busca em tempo real**
✅ **Filtros por categoria, tema, tipo de mídia**
✅ **Toggle para expandir/recolher**
✅ **Botão "Limpar filtros"**
✅ **Botão "Aplicar e fechar"**
✅ **Persistência de estado (localStorage)**
✅ **Responsivo (mobile-first)**

---

## Como Usar

### 1. Adicionar os Arquivos ao HTML

No `<head>` da página:
```html
<link rel="stylesheet" href="css/filtros-moderno.css">
```

Antes do `</body>`:
```html
<script src="js/filtros-moderno.js"></script>
```

### 2. Adicionar Container para Filtros

No HTML, onde você quer os filtros aparecerem:
```html
<div id="filtros-container"></div>
```

### 3. Inicializar o Componente

No seu JavaScript:

```javascript
// Configurar os filtros disponíveis
const config = {
  filtros: {
    categoria: {
      titulo: 'Categoria',
      opcoes: [
        { valor: 'todos', label: 'Todos' },
        { valor: 'indicadores', label: 'Indicadores' },
        { valor: 'documentos', label: 'Documentos' },
        { valor: 'newsletter', label: 'Newsletter' },
        { valor: 'treinamentos', label: 'Treinamentos' },
        { valor: 'report', label: 'Report' },
        { valor: 'awards', label: 'Awards' }
      ]
    },
    tema: {
      titulo: 'Tema',
      opcoes: [
        { valor: 'todos', label: 'Todos' },
        { valor: 'operacional', label: 'Operacional' },
        { valor: 'controle-temperatura', label: 'Controle de Temperatura' },
        { valor: 'ccr', label: 'CCR' },
        { valor: 'falta-entrega', label: 'Falta na Entrega' },
        { valor: 'safety', label: 'Safety' }
      ]
    },
    tipo: {
      titulo: 'Tipo de Mídia',
      opcoes: [
        { valor: 'todos', label: 'Todos' },
        { valor: 'powerbi', label: 'powerbi' },
        { valor: 'pdf', label: 'pdf' },
        { valor: 'infografico', label: 'infografico' },
        { valor: 'video', label: 'video' },
        { valor: 'link_externo', label: 'link_externo' }
      ]
    }
  },
  
  // Callback quando o usuário digita na busca
  onBusca: (termo) => {
    console.log('Buscando:', termo);
    atualizarLista(termo, filtros.estadoFiltros);
  },
  
  // Callback quando filtros são alterados
  onFiltros: (filtrosAtivos) => {
    console.log('Filtros:', filtrosAtivos);
    atualizarLista(filtros.elementos.busca.value, filtrosAtivos);
  },
  
  // Callback quando clica em "Aplicar e fechar"
  onAplicar: (resultado) => {
    console.log('Aplicado:', resultado);
    filtros.salvarEstado();
  }
};

// Criar instância
const filtros = new FiltrosModerno('#filtros-container', config);

// Função para atualizar lista (exemplo)
function atualizarLista(termo, filtrosAtivos) {
  // Implementar filtro e busca
  // Aplicar termo de busca + filtros aos itens
  console.log('Atualizando lista com:', { termo, filtrosAtivos });
}
```

---

## Métodos Disponíveis

### `obterFiltrosAtivos()`
Retorna objeto com filtros e busca ativos:
```javascript
const estado = filtros.obterFiltrosAtivos();
// { busca: "texto", filtros: { categoria: ["docs"], tema: ["safety"] } }
```

### `definirFiltros(filtros)`
Define filtros programaticamente:
```javascript
filtros.definirFiltros({
  categoria: ['documentos'],
  tema: ['operacional']
});
```

### `limparFiltros()`
Limpa todos os filtros:
```javascript
filtros.limparFiltros();
```

### `aplicarFiltros()`
Simula clique em "Aplicar e fechar":
```javascript
filtros.aplicarFiltros();
```

### `salvarEstado()`
Salva estado atual em localStorage:
```javascript
filtros.salvarEstado();
```

### `destruir()`
Remove o componente:
```javascript
filtros.destruir();
```

---

## Integração com Assets/portal-data.js

Se você usa o sistema de dados centralizado:

```javascript
// Em assets/portal-data.js ou assets/conteudos.js

// Obter opções de filtro do banco de dados
async function obterOpcoesFiltro() {
  const { data, error } = await window.supabase
    .from('itens')
    .select('dados');
  
  if (error) return null;

  // Extrair valores únicos
  const categorias = new Set();
  const temas = new Set();
  const tipos = new Set();

  data.forEach(item => {
    if (item.dados.categoria) categorias.add(item.dados.categoria);
    if (item.dados.tema) temas.add(item.dados.tema);
    if (item.dados.tipo_midia) tipos.add(item.dados.tipo_midia);
  });

  return {
    categoria: Array.from(categorias).map(v => ({ valor: v, label: v })),
    tema: Array.from(temas).map(v => ({ valor: v, label: v })),
    tipo_midia: Array.from(tipos).map(v => ({ valor: v, label: v }))
  };
}

// Usar ao inicializar página
document.addEventListener('DOMContentLoaded', async () => {
  const opcoes = await obterOpcoesFiltro();
  
  const filtros = new FiltrosModerno('#filtros-container', {
    filtros: {
      categoria: { titulo: 'Categoria', opcoes: opcoes.categoria },
      tema: { titulo: 'Tema', opcoes: opcoes.tema },
      tipo: { titulo: 'Tipo de Mídia', opcoes: opcoes.tipo_midia }
    },
    onBusca: (termo) => filtrarItens(termo, filtros.estadoFiltros),
    onFiltros: (filtrosAtivos) => filtrarItens(filtros.elementos.busca.value, filtrosAtivos)
  });
});
```

---

## Responsividade

O componente é totalmente responsivo:

- **Desktop (>768px):** Layout horizontal com todos os controles visíveis
- **Tablet (768px-480px):** Filtros em coluna, chips dois por linha
- **Mobile (<480px):** Layout vertical, chips em 50% de largura

---

## Personalização

### Cores
Editar em `css/filtros-moderno.css`:

```css
.filtros-chip.ativo {
  background: #2563eb;  /* Azul padrão */
  color: white;
}

.filtros-aplicar {
  background: #2563eb;
}

.filtros-aplicar:hover {
  background: #1d4ed8;
}
```

### Espacing
```css
.filtros-container {
  padding: 24px;  /* Ajustar espaçamento interno */
  margin-bottom: 24px;
}

.filtros-chips {
  gap: 8px;  /* Espaço entre chips */
}
```

### Fonte
```css
.filtros-chip {
  font-size: 14px;
  font-weight: 500;
}
```

---

## Exemplo Completo: conteudos.html

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="css/portal.css">
  <link rel="stylesheet" href="css/filtros-moderno.css">
</head>
<body>
  <main>
    <!-- Container dos filtros -->
    <div id="filtros-container"></div>
    
    <!-- Lista de itens -->
    <div id="lista-itens"></div>
  </main>

  <script src="js/portal-data.js"></script>
  <script src="js/filtros-moderno.js"></script>
  <script>
    // Inicializar quando documento estiver pronto
    document.addEventListener('DOMContentLoaded', () => {
      const filtros = new FiltrosModerno('#filtros-container', {
        filtros: {
          categoria: {
            titulo: 'Categoria',
            opcoes: [
              { valor: 'todos', label: 'Todos' },
              { valor: 'indicadores', label: 'Indicadores' },
              { valor: 'documentos', label: 'Documentos' }
            ]
          },
          tema: {
            titulo: 'Tema',
            opcoes: [
              { valor: 'todos', label: 'Todos' },
              { valor: 'operacional', label: 'Operacional' },
              { valor: 'safety', label: 'Safety' }
            ]
          }
        },
        onBusca: (termo) => {
          console.log('Busca:', termo);
          atualizarLista();
        },
        onFiltros: (filtrosAtivos) => {
          console.log('Filtros:', filtrosAtivos);
          atualizarLista();
        },
        onAplicar: () => {
          filtros.salvarEstado();
        }
      });

      function atualizarLista() {
        const { busca, filtros: filtrosAtivos } = filtros.obterFiltrosAtivos();
        // Implementar lógica de filtro e busca
        console.log({ busca, filtrosAtivos });
      }
    });
  </script>
</body>
</html>
```

---

## Troubleshooting

### Filtros não aparecem
- Verificar se o container `#filtros-container` existe
- Verificar se `FiltrosModerno` foi carregado
- Verificar console por erros

### Estilos não aplicam
- Verificar se `css/filtros-moderno.css` foi linkado
- Verificar caminho relativo do CSS
- Verificar conflitos de CSS no projeto

### Callbacks não funcionam
- Verificar se funções `onBusca`, `onFiltros` estão definidas
- Usar `console.log()` para debugar
- Verificar se `atualizarLista()` existe

---

## Suporte

Para questões sobre implementação, verifique:
1. Exemplos de uso neste guia
2. Comentários no `js/filtros-moderno.js`
3. Estilos em `css/filtros-moderno.css`

---

**Versão:** 1.0  
**Data:** 15/10/2026  
**Status:** Pronto para uso
