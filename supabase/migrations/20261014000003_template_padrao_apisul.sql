-- Template 'Padrão Apisul' (estrutura da planilha padrão / lista 'Itens do Portal' do SharePoint)
-- e criação do tenant Mondelez. Os itens do cliente ficam fora do repositório
-- (supabase/dados-privados/, não versionado).
insert into public.templates (slug, nome, descricao, estrutura)
values ('padrao-apisul', 'Padrão Apisul', 'Estrutura inicial de todos os tenants: lista Itens do Portal, módulos GR e GL.', $tpl$
{
  "telas": {
    "dashboard": true,
    "sinistros": true
  },
  "tema": {},
  "listas": [
    {
      "slug": "itens-do-portal",
      "nome": "Itens do Portal",
      "descricao": "Conteúdos exibidos nos módulos (cards).",
      "colunas": [
        {
          "chave": "titulo",
          "rotulo": "Título",
          "tipo": "texto",
          "obrigatoria": true,
          "ordem": 1
        },
        {
          "chave": "vertente",
          "rotulo": "Vertente",
          "tipo": "escolha_multipla",
          "obrigatoria": true,
          "opcoes": [
            {
              "valor": "GR"
            },
            {
              "valor": "GL"
            }
          ],
          "ordem": 2
        },
        {
          "chave": "categoria",
          "rotulo": "Categoria",
          "tipo": "escolha",
          "obrigatoria": true,
          "opcoes": [
            {
              "valor": "Indicadores"
            },
            {
              "valor": "Documentos"
            },
            {
              "valor": "Treinamentos"
            },
            {
              "valor": "Newsletter"
            },
            {
              "valor": "Report"
            },
            {
              "valor": "Awards"
            }
          ],
          "ordem": 3
        },
        {
          "chave": "tema",
          "rotulo": "Tema",
          "tipo": "escolha",
          "obrigatoria": true,
          "opcoes": [
            {
              "valor": "Controle de Temperatura"
            },
            {
              "valor": "Falta na Entrega"
            },
            {
              "valor": "Safety"
            },
            {
              "valor": "Operacional"
            },
            {
              "valor": "CCR"
            }
          ],
          "ordem": 4
        },
        {
          "chave": "tipo_midia",
          "rotulo": "Tipo de mídia",
          "tipo": "escolha",
          "obrigatoria": true,
          "opcoes": [
            {
              "valor": "powerbi",
              "rotulo": "Power BI"
            },
            {
              "valor": "pdf",
              "rotulo": "PDF"
            },
            {
              "valor": "infografico",
              "rotulo": "Infográfico"
            },
            {
              "valor": "video",
              "rotulo": "Vídeo"
            },
            {
              "valor": "link_externo",
              "rotulo": "Link externo"
            },
            {
              "valor": "ppt",
              "rotulo": "PowerPoint"
            },
            {
              "valor": "word",
              "rotulo": "Word"
            },
            {
              "valor": "excel",
              "rotulo": "Excel"
            }
          ],
          "ordem": 5
        },
        {
          "chave": "descricao",
          "rotulo": "Descrição",
          "tipo": "texto_longo",
          "ordem": 6
        },
        {
          "chave": "ordem_exibicao",
          "rotulo": "Ordem de exibição",
          "tipo": "numero",
          "padrao": 1,
          "ordem": 7
        },
        {
          "chave": "url_link",
          "rotulo": "Link",
          "tipo": "link",
          "ordem": 8
        },
        {
          "chave": "thumbnail",
          "rotulo": "Thumbnail",
          "tipo": "imagem",
          "ordem": 9
        },
        {
          "chave": "thumbnail_modo",
          "rotulo": "Modo do thumbnail",
          "tipo": "escolha",
          "padrao": "Automático",
          "opcoes": [
            {
              "valor": "Automático"
            },
            {
              "valor": "Manual"
            }
          ],
          "ordem": 10
        },
        {
          "chave": "status_thumbnail",
          "rotulo": "Status do thumbnail",
          "tipo": "texto",
          "padrao": "Pendente",
          "ordem": 11
        },
        {
          "chave": "url_link_processado",
          "rotulo": "Link processado",
          "tipo": "texto",
          "oculta": true,
          "ordem": 12
        },
        {
          "chave": "ativo",
          "rotulo": "Ativo",
          "tipo": "sim_nao",
          "obrigatoria": true,
          "padrao": true,
          "ordem": 13
        }
      ],
      "itens": []
    }
  ],
  "modulos": [
    {
      "slug": "gr",
      "nome": "GR",
      "icone": "shield",
      "ordem": 1,
      "abas": [
        {
          "nome": "Indicadores",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GR"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Indicadores"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Documentos",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GR"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Documentos"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Treinamentos",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GR"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Treinamentos"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Newsletter",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GR"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Newsletter"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Report",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GR"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Report"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Awards",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GR"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Awards"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        }
      ]
    },
    {
      "slug": "gl",
      "nome": "GL",
      "icone": "truck",
      "ordem": 2,
      "abas": [
        {
          "nome": "Indicadores",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GL"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Indicadores"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Documentos",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GL"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Documentos"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Treinamentos",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GL"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Treinamentos"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Newsletter",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GL"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Newsletter"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Report",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GL"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Report"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        },
        {
          "nome": "Awards",
          "lista": "itens-do-portal",
          "visao": {
            "filtros": [
              {
                "coluna": "vertente",
                "op": "contem",
                "valor": "GL"
              },
              {
                "coluna": "categoria",
                "op": "igual",
                "valor": "Awards"
              },
              {
                "coluna": "ativo",
                "op": "igual",
                "valor": true
              }
            ],
            "agrupar_por": [
              "tema"
            ],
            "ordenar_por": [
              {
                "coluna": "ordem_exibicao",
                "direcao": "asc"
              },
              {
                "coluna": "titulo",
                "direcao": "asc"
              }
            ],
            "exibicao": "cards"
          }
        }
      ]
    }
  ]
}
$tpl$::jsonb);

select public.provisionar_tenant(
  p_nome     => 'Mondelez',
  p_slug     => 'mondelez',
  p_template => 'padrao-apisul'
);
