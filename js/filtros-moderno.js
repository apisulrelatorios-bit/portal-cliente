// Componente de Filtros Moderno
// Uso: new FiltrosModerno('#elemento-container', config)

class FiltrosModerno {
  constructor(seletor, config = {}) {
    this.container = document.querySelector(seletor);
    if (!this.container) {
      console.error('Elemento de filtros não encontrado:', seletor);
      return;
    }

    this.config = {
      onBusca: config.onBusca || (() => {}),
      onFiltros: config.onFiltros || (() => {}),
      onAplicar: config.onAplicar || (() => {}),
      filtros: config.filtros || {},
      ...config
    };

    this.estadoFiltros = {};
    this.init();
  }

  init() {
    this.construirHTML();
    this.anexarEventos();
    this.restaurarEstado();
  }

  construirHTML() {
    const html = `
      <div class="filtros-container">
        <div class="filtros-header">
          <div class="filtros-header-left">
            <button class="filtros-toggle" id="filtros-toggle" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
              </svg>
              Filtrar conteúdos
            </button>
            <div class="filtros-busca">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="filtros-busca" placeholder="Buscar por título..." autocomplete="off">
            </div>
          </div>
          <div class="filtros-acoes">
            <button class="filtros-limpar" id="filtros-limpar" type="button">Limpar filtros</button>
            <button class="filtros-aplicar" id="filtros-aplicar" type="button">Aplicar e fechar</button>
          </div>
        </div>

        <div class="filtros-conteudo" id="filtros-conteudo">
          ${this.construirGrupos()}
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.elementos = {
      toggle: this.container.querySelector('#filtros-toggle'),
      busca: this.container.querySelector('#filtros-busca'),
      limpar: this.container.querySelector('#filtros-limpar'),
      aplicar: this.container.querySelector('#filtros-aplicar'),
      conteudo: this.container.querySelector('#filtros-conteudo'),
      container: this.container.querySelector('.filtros-container')
    };
  }

  construirGrupos() {
    let html = '';
    for (const [chave, grupo] of Object.entries(this.config.filtros)) {
      html += `
        <div class="filtros-grupo">
          <label class="filtros-grupo-titulo">${grupo.titulo}</label>
          <div class="filtros-chips" data-grupo="${chave}">
            ${grupo.opcoes.map(opt => `
              <button type="button" class="filtros-chip" data-valor="${opt.valor}" data-grupo="${chave}">
                ${opt.label}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }
    return html;
  }

  anexarEventos() {
    // Toggle filtros
    this.elementos.toggle.addEventListener('click', () => {
      this.elementos.container.classList.toggle('oculto');
      this.elementos.toggle.classList.toggle('ativo');
    });

    // Busca
    this.elementos.busca.addEventListener('input', (e) => {
      this.config.onBusca(e.target.value);
    });

    // Chips de filtro
    this.container.querySelectorAll('.filtros-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const grupo = chip.dataset.grupo;
        const valor = chip.dataset.valor;

        // Toggle seleção
        chip.classList.toggle('ativo');

        // Atualizar estado
        if (!this.estadoFiltros[grupo]) {
          this.estadoFiltros[grupo] = [];
        }
        if (chip.classList.contains('ativo')) {
          if (!this.estadoFiltros[grupo].includes(valor)) {
            this.estadoFiltros[grupo].push(valor);
          }
        } else {
          this.estadoFiltros[grupo] = this.estadoFiltros[grupo].filter(v => v !== valor);
        }

        // Callback em tempo real
        this.config.onFiltros(this.estadoFiltros);
      });
    });

    // Limpar filtros
    this.elementos.limpar.addEventListener('click', () => {
      this.limparFiltros();
    });

    // Aplicar e fechar
    this.elementos.aplicar.addEventListener('click', () => {
      this.aplicarFiltros();
    });
  }

  limparFiltros() {
    // Remover classe ativo de todos os chips
    this.container.querySelectorAll('.filtros-chip').forEach(chip => {
      chip.classList.remove('ativo');
    });

    // Limpar estado
    this.estadoFiltros = {};

    // Limpar busca
    this.elementos.busca.value = '';

    // Callbacks
    this.config.onBusca('');
    this.config.onFiltros(this.estadoFiltros);
  }

  aplicarFiltros() {
    this.config.onAplicar({
      busca: this.elementos.busca.value,
      filtros: this.estadoFiltros
    });

    // Fechar painel
    this.elementos.container.classList.add('oculto');
    this.elementos.toggle.classList.remove('ativo');
  }

  obterFiltrosAtivos() {
    return {
      busca: this.elementos.busca.value,
      filtros: this.estadoFiltros
    };
  }

  definirFiltros(filtros) {
    this.estadoFiltros = filtros;

    // Atualizar UI
    this.container.querySelectorAll('.filtros-chip').forEach(chip => {
      const grupo = chip.dataset.grupo;
      const valor = chip.dataset.valor;

      if (filtros[grupo] && filtros[grupo].includes(valor)) {
        chip.classList.add('ativo');
      } else {
        chip.classList.remove('ativo');
      }
    });
  }

  restaurarEstado() {
    try {
      const estado = localStorage.getItem('filtrosEstado');
      if (estado) {
        const parsed = JSON.parse(estado);
        this.definirFiltros(parsed);
      }
    } catch (e) {
      console.warn('Erro ao restaurar estado dos filtros:', e);
    }
  }

  salvarEstado() {
    try {
      localStorage.setItem('filtrosEstado', JSON.stringify(this.estadoFiltros));
    } catch (e) {
      console.warn('Erro ao salvar estado dos filtros:', e);
    }
  }

  destruir() {
    this.container.innerHTML = '';
  }
}

// Exemplo de uso em conteudos.html:
/*
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
        { valor: 'operacional', label: 'Operacional' }
      ]
    }
  },
  onBusca: (termo) => {
    console.log('Buscando:', termo);
    atualizarLista(termo, filtros.estadoFiltros);
  },
  onFiltros: (filtrosAtivos) => {
    console.log('Filtros alterados:', filtrosAtivos);
    atualizarLista(filtros.elementos.busca.value, filtrosAtivos);
  },
  onAplicar: (resultado) => {
    console.log('Aplicar clicado:', resultado);
  }
});
*/
