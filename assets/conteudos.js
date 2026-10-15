/*
 * conteudos.js — Cadastro de conteúdos pelo operador (conteudos.html)
 *
 * Funciona como uma lista do SharePoint: a tabela e o formulário são
 * montados a partir das colunas da lista (tipos, obrigatórias, opções).
 * O banco valida tudo de novo (trigger validar_item + RLS).
 *
 * Thumbnail semiautomático (PRODUCT.md §7):
 *   Automático: imagem, PDF (1ª página, no navegador), YouTube/Vimeo, vídeo enviado
 *   Manual: Power BI, site, Office, SharePoint/OneDrive — o operador envia um print
 *   Se o automático falhar, cai para Manual mostrando o motivo.
 */
(function () {
  "use strict";

  var THUMB_KEYS = ["thumbnail", "thumbnail_modo", "status_thumbnail", "url_link_processado"];
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var MAX_THUMB = 20 * 1024 * 1024; /* antes da compressão (vai para ~800 px WEBP) */

  var api = null;
  var tenant = null;
  var listas = [];
  var lista = null;
  var colunas = [];
  var itens = [];
  var ordem = { chave: null, dir: 1 };
  var editando = null;   /* item em edição (null = novo) */
  var enviadosNaoSalvos = []; /* arquivos enviados neste formulário e ainda não salvos */
  var salvou = false;
  var ACEITA_ARQUIVO = "application/pdf,image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm," +
    ".ppt,.pptx,.xls,.xlsx,.doc,.docx";
  var thumb = null;      /* estado do thumbnail no formulário aberto */

  /* ---------------- utilitários ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(v) {
    return String(v === null || v === undefined ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function vazio(v) {
    return v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
  }

  function toast(msg, tipo) {
    var el = $("#admin-toast");
    el.textContent = msg;
    el.className = "admin-toast" + (tipo ? " admin-toast--" + tipo : "");
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.hidden = true; }, tipo === "erro" ? 7000 : 4000);
  }

  function erroForm(msg) {
    var p = $("#form-item .admin-form-erro");
    p.textContent = msg || "";
    p.hidden = !msg;
  }

  function coluna(chave) { return colunas.filter(function (c) { return c.chave === chave; })[0]; }

  function rotuloOpcao(col, valor) {
    var o = (col.opcoes || []).filter(function (x) { return x.valor === valor; })[0];
    return (o && o.rotulo) || valor;
  }

  function dataBr(iso, comHora) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString("pt-BR") + (comHora ? " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
  }

  function textoValor(col, v) {
    if (vazio(v)) return "";
    switch (col.tipo) {
      case "escolha": return rotuloOpcao(col, v);
      case "escolha_multipla": return (Array.isArray(v) ? v : [v]).map(function (x) { return rotuloOpcao(col, x); }).join(", ");
      case "sim_nao": return v ? "Sim" : "Não";
      case "moeda": return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      case "porcentagem": return Number(v).toLocaleString("pt-BR") + "%";
      case "data": return dataBr(v, false);
      case "data_hora": return dataBr(v, true);
      default: return String(v);
    }
  }

  /* ---------------- carga ---------------- */

  async function carregarLista(listaId) {
    lista = listas.filter(function (l) { return l.id === listaId; })[0];
    $("#tabela-itens").innerHTML = '<p class="admin-loading">Carregando itens…</p>';
    var res = await Promise.all([api.estrutura(lista.id), api.itens(lista.id)]);
    colunas = res[0];
    itens = res[1];
    $("#thumb-box").hidden = !coluna("thumbnail");
    renderTabela();
  }

  /* ---------------- tabela ---------------- */

  /* Até 6 colunas na tabela; a coluna "ativo" (se existir) sempre aparece. */
  function colunasTabela() {
    var candidatas = colunas.filter(function (c) {
      return !c.oculta && THUMB_KEYS.indexOf(c.chave) === -1 &&
        ["texto_longo", "link", "imagem", "arquivo"].indexOf(c.tipo) === -1;
    });
    var ativo = candidatas.filter(function (c) { return c.chave === "ativo"; })[0];
    var outras = candidatas.filter(function (c) { return c !== ativo; }).slice(0, ativo ? 5 : 6);
    return ativo ? outras.concat(ativo) : outras;
  }

  function pendente(item) {
    var d = item.dados || {};
    var st = String(d.status_thumbnail || "");
    return !d.thumbnail || /^pendente|^erro/i.test(st);
  }

  function itensFiltrados() {
    // Obter filtros do novo componente se disponível
    var filtrosAtivos = (window.getFiltrosAtivos && window.getFiltrosAtivos()) || { busca: '', filtros: {} };
    var termo = (filtrosAtivos.busca || "").trim().toLowerCase();
    var filtrosObj = filtrosAtivos.filtros || {};

    var lista2 = itens.filter(function (item) {
      var d = item.dados || {};

      // Filtrar por categoria
      if (filtrosObj.categoria && filtrosObj.categoria.length > 0 &&
          filtrosObj.categoria.indexOf("todos") === -1) {
        if (!d.categoria || filtrosObj.categoria.indexOf(d.categoria) === -1) return false;
      }

      // Filtrar por tema
      if (filtrosObj.tema && filtrosObj.tema.length > 0 &&
          filtrosObj.tema.indexOf("todos") === -1) {
        if (!d.tema || filtrosObj.tema.indexOf(d.tema) === -1) return false;
      }

      // Filtrar por tipo de mídia
      if (filtrosObj.tipo_midia && filtrosObj.tipo_midia.length > 0 &&
          filtrosObj.tipo_midia.indexOf("todos") === -1) {
        if (!d.tipo_midia || filtrosObj.tipo_midia.indexOf(d.tipo_midia) === -1) return false;
      }

      // Filtro por busca
      if (!termo) return true;
      return colunas.some(function (c) {
        return textoValor(c, d[c.chave]).toLowerCase().indexOf(termo) !== -1;
      });
    });

    // Aplicar ordenação
    if (ordem.chave) {
      var col = ordem.chave === "__atualizado" ? null : coluna(ordem.chave);
      lista2.sort(function (a, b) {
        var va = col ? textoValor(col, a.dados[col.chave]) : a.updated_at;
        var vb = col ? textoValor(col, b.dados[col.chave]) : b.updated_at;
        if (col && ["numero", "moeda", "porcentagem"].indexOf(col.tipo) !== -1) {
          va = Number(a.dados[col.chave] || 0); vb = Number(b.dados[col.chave] || 0);
          return (va - vb) * ordem.dir;
        }
        return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * ordem.dir;
      });
    }
    return lista2;
  }

  // Função para atualizar tabela quando filtros mudam
  window.updateTableWithFilters = function() {
    renderTabela();
  };

  function renderTabela() {
    var cols = colunasTabela();
    var temThumb = !!coluna("thumbnail");
    var linhas = itensFiltrados();
    var box = $("#tabela-itens");
    if (!itens.length) {
      box.innerHTML = '<div class="admin-empty"><h3>Nenhum item ainda</h3><p>Clique em <strong>+ Novo item</strong> para cadastrar o primeiro conteúdo.</p></div>';
      return;
    }
    if (!linhas.length) {
      box.innerHTML = '<div class="admin-empty"><p>Nenhum item encontrado com esse filtro.</p></div>';
      return;
    }
    function th(chave, rotulo) {
      var seta = ordem.chave === chave ? (ordem.dir === 1 ? " ▲" : " ▼") : "";
      return '<th scope="col"><button type="button" data-ordenar="' + esc(chave) + '">' + esc(rotulo) + seta + "</button></th>";
    }
    var html = '<table class="tabela-itens"><thead><tr>' +
      (temThumb ? '<th scope="col" class="col-thumb"><span class="sr-only">Capa</span></th>' : "") +
      cols.map(function (c) { return th(c.chave, c.rotulo); }).join("") +
      th("__atualizado", "Atualizado") +
      "</tr></thead><tbody>";
    html += linhas.map(function (item) {
      var d = item.dados || {};
      var celulas = cols.map(function (c) {
        var v = d[c.chave];
        if (c.tipo === "sim_nao") {
          return '<td><span class="admin-chip' + (v === false ? " is-off" : "") + '">' + (v === false ? "Não" : "Sim") + "</span></td>";
        }
        var t = textoValor(c, v);
        return "<td" + (c.chave === "titulo" ? ' class="col-titulo"' : "") + ">" + esc(t || "—") + "</td>";
      }).join("");
      var capa = "";
      if (temThumb) {
        var aviso = pendente(item) ? '<span class="thumb-alerta" title="' + esc(d.status_thumbnail || "Sem thumbnail") + '">!</span>' : "";
        capa = '<td class="col-thumb">' + (d.thumbnail
          ? '<img src="' + esc(d.thumbnail) + '" alt="" loading="lazy">'
          : '<span class="thumb-vazia"></span>') + aviso + "</td>";
      }
      return '<tr data-item="' + esc(item.id) + '" tabindex="0">' + capa + celulas +
        '<td class="col-data">' + esc(dataBr(item.updated_at, true)) + "</td></tr>";
    }).join("");
    box.innerHTML = html + "</tbody></table>";
  }

  /* ---------------- formulário ---------------- */

  function campoHTML(c, valor) {
    var id = "campo-" + c.chave;
    var obrig = c.obrigatoria ? ' <span class="obrig" aria-hidden="true">*</span>' : "";
    var req = c.obrigatoria ? " required" : "";
    var largo = c.tipo === "texto_longo" || c.tipo === "escolha_multipla" ? " campo--largo" : "";
    var v = vazio(valor) ? "" : valor;
    var controle;
    switch (c.tipo) {
      case "texto_longo":
        controle = '<textarea id="' + id + '" data-chave="' + esc(c.chave) + '" rows="3"' + req + ">" + esc(v) + "</textarea>";
        break;
      case "numero": case "moeda": case "porcentagem":
        controle = '<input id="' + id + '" data-chave="' + esc(c.chave) + '" type="number" step="any" value="' + esc(v) + '"' + req + ">";
        break;
      case "data":
        controle = '<input id="' + id + '" data-chave="' + esc(c.chave) + '" type="date" value="' + esc(String(v).slice(0, 10)) + '"' + req + ">";
        break;
      case "data_hora":
        controle = '<input id="' + id + '" data-chave="' + esc(c.chave) + '" type="datetime-local" value="' + esc(String(v).slice(0, 16)) + '"' + req + ">";
        break;
      case "link": case "imagem": case "arquivo":
        controle = '<input id="' + id + '" data-chave="' + esc(c.chave) + '" type="url" placeholder="https://..." value="' + esc(v) + '"' + req + ">";
        if (c.chave === "url_link" || c.tipo === "arquivo") {
          /* Cola um link OU envia o arquivo (vai para o Supabase e o link é preenchido). */
          controle = '<span class="campo-arquivo">' + controle +
            '<label class="admin-btn" for="up-' + id + '">Enviar arquivo</label>' +
            '<input type="file" id="up-' + id + '" data-upload-para="' + esc(c.chave) + '" accept="' + ACEITA_ARQUIVO + '" hidden></span>' +
            '<small class="campo-ajuda" data-ajuda-de="' + esc(c.chave) + '">Cole um link ou envie o arquivo (PDF, imagem, Office ou vídeo, até 50 MB).</small>';
        }
        break;
      case "sim_nao":
        var marcado = valor === undefined ? c.padrao !== false : valor !== false;
        return '<label class="admin-check campo"><input type="checkbox" data-chave="' + esc(c.chave) + '"' + (marcado ? " checked" : "") + "> " + esc(c.rotulo) + "</label>";
      case "escolha":
        var opts = c.opcoes.filter(function (o) { return o.ativa || o.valor === valor; });
        controle = '<select id="' + id + '" data-chave="' + esc(c.chave) + '"' + req + '><option value="">Selecione…</option>' +
          opts.map(function (o) {
            return '<option value="' + esc(o.valor) + '"' + (o.valor === valor ? " selected" : "") + ">" + esc(o.rotulo || o.valor) + "</option>";
          }).join("") + "</select>";
        break;
      case "escolha_multipla":
        var sel = Array.isArray(valor) ? valor : [];
        controle = '<div class="multi" data-chave="' + esc(c.chave) + '" role="group" aria-label="' + esc(c.rotulo) + '">' +
          c.opcoes.filter(function (o) { return o.ativa || sel.indexOf(o.valor) !== -1; }).map(function (o) {
            return '<label class="multi-op"><input type="checkbox" value="' + esc(o.valor) + '"' + (sel.indexOf(o.valor) !== -1 ? " checked" : "") + "> " + esc(o.rotulo || o.valor) + "</label>";
          }).join("") + "</div>";
        return '<div class="campo' + largo + '"><span class="campo-rotulo">' + esc(c.rotulo) + obrig + "</span>" + controle + "</div>";
      default:
        controle = '<input id="' + id + '" data-chave="' + esc(c.chave) + '" type="text" value="' + esc(v) + '"' + req + ">";
    }
    return '<label class="campo' + largo + '" for="' + id + '"><span class="campo-rotulo">' + esc(c.rotulo) + obrig + "</span>" + controle + "</label>";
  }

  function lerCampos() {
    var dados = {};
    colunas.forEach(function (c) {
      if (THUMB_KEYS.indexOf(c.chave) !== -1 || c.oculta) return;
      if (c.tipo === "escolha_multipla") {
        var box = $('.multi[data-chave="' + c.chave + '"]');
        var vals = $all("input:checked", box).map(function (i) { return i.value; });
        if (vals.length) dados[c.chave] = vals;
        return;
      }
      var el = $('[data-chave="' + c.chave + '"]', $("#item-campos"));
      if (!el) return;
      if (c.tipo === "sim_nao") { dados[c.chave] = el.checked; return; }
      var v = el.value.trim();
      if (!v) return;
      if (["numero", "moeda", "porcentagem"].indexOf(c.tipo) !== -1) dados[c.chave] = Number(v);
      else dados[c.chave] = v;
    });
    return dados;
  }

  function abrirItem(item) {
    editando = item || null;
    var d = item ? item.dados || {} : {};
    $("#dlg-item-titulo").textContent = item ? "Editar item" : "Novo item";
    $("#btn-excluir-item").hidden = !item;
    erroForm("");
    $("#item-campos").innerHTML = colunas
      .filter(function (c) { return THUMB_KEYS.indexOf(c.chave) === -1 && !c.oculta; })
      .map(function (c) { return campoHTML(c, d[c.chave]); }).join("");
    $all("#item-campos input, #item-campos select").forEach(function (el) {
      if (el.hasAttribute("data-upload-para")) return;
      el.addEventListener("input", agendarThumb);
      el.addEventListener("change", agendarThumb);
    });
    $all("#item-campos [data-upload-para]").forEach(function (el) {
      el.addEventListener("change", enviarArquivoDoCampo);
    });
    enviadosNaoSalvos = [];
    salvou = false;
    iniciarThumb(d);
    $("#dlg-item").showModal();
    var primeiro = $("#item-campos input, #item-campos select, #item-campos textarea");
    if (primeiro) primeiro.focus();
  }

  /* ---------------- envio de arquivo do conteúdo ---------------- */

  async function enviarArquivoDoCampo(event) {
    var input = event.target;
    var arquivo = input.files && input.files[0];
    input.value = "";
    if (!arquivo) return;
    var chave = input.getAttribute("data-upload-para");
    var alvo = $('[data-chave="' + chave + '"]', $("#item-campos"));
    var ajuda = $('[data-ajuda-de="' + chave + '"]', $("#item-campos"));
    if (arquivo.size > 50 * 1024 * 1024) { erroForm("O arquivo tem mais de 50 MB."); return; }
    erroForm("");
    var tituloEl = $('[data-chave="titulo"]', $("#item-campos"));
    if (ajuda) { ajuda.textContent = "Enviando " + arquivo.name + "…"; ajuda.classList.remove("is-erro"); }
    try {
      var url = await api.enviarArquivo(tenant.id, arquivo, tituloEl && tituloEl.value.trim() ? tituloEl.value.trim() : null);
      enviadosNaoSalvos.push(url);
      alvo.value = url;
      if (ajuda) ajuda.textContent = "✓ " + arquivo.name + " enviado para o portal.";
      /* Sugere o tipo de mídia pelo arquivo, se ainda não foi escolhido. */
      var tipoEl = $('[data-chave="tipo_midia"]', $("#item-campos"));
      if (tipoEl && !tipoEl.value) {
        var sugestao = arquivo.type === "application/pdf" ? "pdf" : /^image\//.test(arquivo.type) ? "infografico" :
          /^video\//.test(arquivo.type) ? "video" : /\.pptx?$/i.test(arquivo.name) ? "ppt" :
          /\.xlsx?$/i.test(arquivo.name) ? "excel" : /\.docx?$/i.test(arquivo.name) ? "word" : "";
        if (sugestao && $('option[value="' + sugestao + '"]', tipoEl)) tipoEl.value = sugestao;
      }
      avaliarThumb(false);
    } catch (e) {
      if (ajuda) { ajuda.textContent = "Não foi possível enviar: " + e.message; ajuda.classList.add("is-erro"); }
    }
  }

  /* ---------------- thumbnail semiautomático ---------------- */

  function linkAtual() {
    var col = coluna("url_link") || colunas.filter(function (c) { return c.tipo === "link"; })[0];
    var el = col && $('[data-chave="' + col.chave + '"]', $("#item-campos"));
    return el ? el.value.trim() : "";
  }

  function tipoMidiaAtual() {
    var el = $('[data-chave="tipo_midia"]', $("#item-campos"));
    return el ? el.value : "";
  }

  function extensao(url) {
    try { return (new URL(url).pathname.split(".").pop() || "").toLowerCase(); } catch (_) { return ""; }
  }

  /* Decide se o thumbnail desse link é automático ou manual (print). */
  function classificar(url, tipoMidia) {
    if (!url) return { tipo: "vazio", auto: false, dica: "Informe o link para saber se a capa é automática." };
    var host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return { tipo: "invalido", auto: false, dica: "O link não parece válido." }; }
    var ext = extensao(url);
    var yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    if (yt) return { tipo: "youtube", auto: true, id: yt[1] };
    if (/vimeo\.com$/.test(host) || /\.vimeo\.com$/.test(host)) return { tipo: "vimeo", auto: true };
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].indexOf(ext) !== -1) return { tipo: "imagem", auto: true };
    if (ext === "pdf") return { tipo: "pdf", auto: true };
    if (["mp4", "webm", "ogg", "mov"].indexOf(ext) !== -1) return { tipo: "video", auto: true };
    if (/powerbi\.com$/.test(host) || tipoMidia === "powerbi") {
      return { tipo: "powerbi", auto: false, dica: "Abra o relatório do Power BI, tire um print da página principal e cole aqui." };
    }
    if (/sharepoint\.com$|onedrive|1drv\.ms/.test(host)) {
      return { tipo: "sharepoint", auto: false, dica: "Links do SharePoint/OneDrive exigem login. Abra o arquivo, tire um print e cole aqui." };
    }
    if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].indexOf(ext) !== -1 || ["word", "excel", "ppt"].indexOf(tipoMidia) !== -1) {
      return { tipo: "office", auto: false, dica: "Abra o arquivo, tire um print da 1ª página ou slide e cole aqui." };
    }
    return { tipo: "site", auto: false, dica: "Abra a página, tire um print da parte principal e cole aqui." };
  }

  function carregarScript(src) {
    return new Promise(function (ok, falha) {
      if ($('script[src="' + src + '"]')) { ok(); return; }
      var s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = function () { falha(new Error("não foi possível carregar o leitor de PDF")); };
      document.head.appendChild(s);
    });
  }

  function canvasParaBlob(canvas) {
    return new Promise(function (ok, falha) {
      try {
        canvas.toBlob(function (b) { b ? ok(b) : falha(new Error("não foi possível gerar a imagem")); }, "image/webp", 0.86);
      } catch (e) { falha(new Error("o servidor do arquivo não permite gerar a capa (CORS)")); }
    });
  }

  function testarImagem(url) {
    return new Promise(function (ok, falha) {
      var img = new Image();
      var t = setTimeout(function () { falha(new Error("a imagem demorou demais para responder")); }, 10000);
      img.onload = function () { clearTimeout(t); ok(); };
      img.onerror = function () { clearTimeout(t); falha(new Error("a imagem do link não abriu")); };
      img.src = url;
    });
  }

  async function capaDePdf(url) {
    await carregarScript(PDFJS);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    var doc;
    try {
      doc = await window.pdfjsLib.getDocument({ url: url }).promise;
    } catch (e) {
      throw new Error(/password/i.test(e && e.name) ? "o PDF é protegido por senha" : "não foi possível abrir o PDF (link bloqueado ou inválido)");
    }
    var pagina = await doc.getPage(1);
    var base = pagina.getViewport({ scale: 1 });
    var escala = Math.min(2, 900 / base.width);
    var vp = pagina.getViewport({ scale: escala });
    var canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await pagina.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    return canvasParaBlob(canvas);
  }

  function capaDeVideo(url) {
    return new Promise(function (ok, falha) {
      var v = document.createElement("video");
      var t = setTimeout(function () { falha(new Error("o vídeo demorou demais para carregar")); }, 15000);
      v.crossOrigin = "anonymous"; v.muted = true; v.preload = "auto"; v.src = url;
      v.addEventListener("error", function () { clearTimeout(t); falha(new Error("o vídeo não abriu")); });
      v.addEventListener("loadeddata", function () { v.currentTime = Math.min(1, (v.duration || 2) / 3); });
      v.addEventListener("seeked", function () {
        clearTimeout(t);
        var c = document.createElement("canvas");
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext("2d").drawImage(v, 0, 0);
        canvasParaBlob(c).then(ok, falha);
      });
    });
  }

  async function gerarAutomatico(url, info) {
    if (info.tipo === "youtube") return { url: "https://img.youtube.com/vi/" + info.id + "/hqdefault.jpg" };
    if (info.tipo === "vimeo") {
      var r = await fetch("https://vimeo.com/api/oembed.json?url=" + encodeURIComponent(url));
      if (!r.ok) throw new Error("o Vimeo não informou a capa do vídeo");
      var j = await r.json();
      if (!j.thumbnail_url) throw new Error("o Vimeo não informou a capa do vídeo");
      return { url: j.thumbnail_url };
    }
    if (info.tipo === "imagem") { await testarImagem(url); return { url: url }; }
    if (info.tipo === "pdf") return { blob: await capaDePdf(url) };
    if (info.tipo === "video") return { blob: await capaDeVideo(url) };
    throw new Error("tipo não suportado");
  }

  function iniciarThumb(d) {
    if (thumb && thumb.preview) URL.revokeObjectURL(thumb.preview);
    thumb = {
      urlOriginal: d.thumbnail || "",
      url: d.thumbnail || "",
      blob: null,
      preview: null,
      modo: d.thumbnail_modo || "Automático",
      status: d.status_thumbnail || (d.thumbnail ? "" : "Pendente"),
      linkProcessado: d.url_link_processado || "",
      manual: d.thumbnail_modo === "Manual" && !!d.thumbnail,
      estado: d.thumbnail ? (d.thumbnail_modo === "Manual" ? "manual-ok" : "auto-ok") : "pendente",
      seq: 0,
      info: null
    };
    renderThumb();
    if (coluna("thumbnail")) avaliarThumb(false);
  }

  var timerThumb = null;
  function agendarThumb(event) {
    var chave = event && event.target && event.target.getAttribute("data-chave");
    if (chave && chave !== "url_link" && chave !== "tipo_midia" && !(coluna(chave) && coluna(chave).tipo === "link")) return;
    clearTimeout(timerThumb);
    timerThumb = setTimeout(function () { avaliarThumb(false); }, 700);
  }

  /* Reavalia a capa quando o link (ou o tipo de mídia) muda. */
  async function avaliarThumb(forcarAuto) {
    if (!coluna("thumbnail")) return;
    var url = linkAtual();
    var info = classificar(url, tipoMidiaAtual());
    thumb.info = info;
    var mudouLink = url !== thumb.linkProcessado;

    if (!forcarAuto && !mudouLink && thumb.url) { renderThumb(); return; }

    if (!forcarAuto && thumb.manual && (thumb.url || thumb.blob)) {
      /* Item manual: link mudou → pendente, mantém o print antigo até ser trocado. */
      if (mudouLink && url) { thumb.status = "Pendente"; thumb.estado = "manual-pendente"; }
      renderThumb();
      return;
    }

    if (info.tipo === "vazio") { renderThumb(); return; }

    if (!info.auto) {
      thumb.modo = "Manual";
      if (!thumb.blob) { thumb.url = mudouLink ? "" : thumb.url; thumb.status = "Pendente"; thumb.estado = "manual-pendente"; }
      renderThumb();
      return;
    }

    var minha = ++thumb.seq;
    thumb.estado = "gerando";
    renderThumb();
    try {
      var res = await gerarAutomatico(url, info);
      if (minha !== thumb.seq) return;
      limparBlob();
      thumb.url = res.url || "";
      if (res.blob) { thumb.blob = res.blob; thumb.preview = URL.createObjectURL(res.blob); }
      thumb.modo = "Automático";
      thumb.manual = false;
      thumb.status = "Gerado automaticamente";
      thumb.estado = "auto-ok";
      thumb.linkProcessado = url;
    } catch (e) {
      if (minha !== thumb.seq) return;
      limparBlob();
      thumb.url = "";
      thumb.modo = "Manual";
      thumb.status = "Erro: " + (e.message || "falha ao gerar a capa");
      thumb.estado = "erro";
    }
    renderThumb();
  }

  function limparBlob() {
    if (thumb.preview) URL.revokeObjectURL(thumb.preview);
    thumb.blob = null;
    thumb.preview = null;
  }

  function usarImagemManual(arquivo) {
    if (!arquivo) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) { erroForm("Use uma imagem PNG, JPG, WEBP ou GIF."); return; }
    if (arquivo.size > MAX_THUMB) { erroForm("A imagem tem mais de 20 MB."); return; }
    erroForm("");
    thumb.seq++;
    limparBlob();
    thumb.blob = arquivo;
    thumb.preview = URL.createObjectURL(arquivo);
    thumb.url = "";
    thumb.modo = "Manual";
    thumb.manual = true;
    thumb.status = "Enviado manualmente";
    thumb.estado = "manual-ok";
    thumb.linkProcessado = linkAtual();
    renderThumb();
  }

  function renderThumb() {
    if (!thumb) return;
    var src = thumb.preview || thumb.url;
    var prev = $("#thumb-preview");
    prev.innerHTML = src ? '<img src="' + esc(src) + '" alt="Prévia da capa">' : "<span>" + (thumb.estado === "gerando" ? "Gerando…" : "Sem imagem") + "</span>";
    prev.classList.toggle("is-gerando", thumb.estado === "gerando");

    var st = $("#thumb-status");
    var info = thumb.info || {};
    var mostrarDrop = false;
    var classe = "";
    var texto = "";
    switch (thumb.estado) {
      case "gerando": classe = "is-info"; texto = "Gerando a capa automaticamente…"; break;
      case "auto-ok":
        classe = "is-ok";
        texto = thumb.status === "Migrado do SharePoint" ? "Capa migrada do SharePoint" : "🟢 Thumbnail gerado automaticamente";
        break;
      case "manual-ok": classe = "is-ok"; texto = "🟢 Print enviado manualmente"; break;
      case "erro": classe = "is-erro"; texto = "🔴 Não foi possível gerar automaticamente: " + thumb.status.replace(/^Erro:\s*/, "") + ". Envie um print."; mostrarDrop = true; break;
      default:
        classe = "is-aviso";
        texto = info.tipo === "vazio" || !info.tipo ? "Informe o link para definir a capa." : "🟡 Thumbnail manual: envie um print";
        mostrarDrop = info.tipo !== "vazio";
    }
    if (thumb.estado === "manual-pendente" && (thumb.url || thumb.blob)) texto = "🟡 O link mudou: envie um print novo (o atual fica até lá)";
    st.className = "thumb-status " + classe;
    st.textContent = texto;
    var drop = $("#thumb-drop");
    if (thumb.forcarDrop) mostrarDrop = true;
    drop.hidden = !mostrarDrop;
    $("#thumb-dica").textContent = info.dica || "";
    $("#btn-thumb-trocar").hidden = mostrarDrop || !(thumb.url || thumb.blob);
    $("#btn-thumb-auto").hidden = !(info.auto && thumb.estado !== "auto-ok" && thumb.estado !== "gerando");
  }

  /* ---------------- salvar / excluir ---------------- */

  async function salvar(event) {
    event.preventDefault();
    erroForm("");
    var form = $("#form-item");
    var dados = lerCampos();
    var faltando = colunas.filter(function (c) {
      return c.obrigatoria && THUMB_KEYS.indexOf(c.chave) === -1 && !c.oculta && c.tipo !== "sim_nao" && vazio(dados[c.chave]) && vazio(c.padrao);
    });
    if (faltando.length) { erroForm("Preencha: " + faltando.map(function (c) { return c.rotulo; }).join(", ") + "."); return; }
    if (thumb.estado === "gerando") { erroForm("Aguarde a capa terminar de ser gerada."); return; }

    var botoes = $all("button, input, select, textarea", form);
    botoes.forEach(function (b) { b.disabled = true; });
    var enviada = null;
    try {
      if (coluna("thumbnail")) {
        var urlCapa = thumb.url;
        if (thumb.blob) {
          enviada = await api.enviarThumbnail(tenant.id, thumb.blob, dados.titulo || "capa");
          urlCapa = enviada;
        }
        if (urlCapa) {
          dados.thumbnail = urlCapa;
          if (coluna("url_link_processado") && thumb.linkProcessado) dados.url_link_processado = thumb.linkProcessado;
        }
        if (coluna("thumbnail_modo")) dados.thumbnail_modo = thumb.modo === "Manual" ? "Manual" : "Automático";
        if (coluna("status_thumbnail")) dados.status_thumbnail = urlCapa ? (thumb.status || "Gerado automaticamente") : (thumb.status && /^Erro/.test(thumb.status) ? thumb.status : "Pendente");
      }
      if (editando) await api.atualizar(editando.id, dados);
      else await api.criar(tenant.id, lista.id, dados);

      var antiga = thumb.urlOriginal;
      if (antiga && antiga !== dados.thumbnail) api.apagarThumbnail(antiga).catch(function () {});
      salvou = true;
      enviadosNaoSalvos.filter(function (u) { return u !== dados.url_link; }).forEach(function (u) { api.apagarArquivo(u).catch(function () {}); });
      enviadosNaoSalvos = [];
      var linkAntigo = editando && editando.dados ? editando.dados.url_link : "";
      if (linkAntigo && linkAntigo !== dados.url_link && api.ehArquivoDoPortal(linkAntigo)) api.apagarArquivo(linkAntigo).catch(function () {});
      $("#dlg-item").close();
      toast(editando ? "Item atualizado." : "Item criado.", "ok");
      itens = await api.itens(lista.id);
      renderTabela();
    } catch (e) {
      if (enviada) api.apagarThumbnail(enviada).catch(function () {});
      var msg = (e && e.message) || String(e);
      if (/row-level security|permission denied/i.test(msg)) msg = "Você não tem permissão para alterar os conteúdos deste cliente.";
      erroForm(msg);
    } finally {
      botoes.forEach(function (b) { b.disabled = false; });
    }
  }

  async function excluir() {
    if (!editando) return;
    var titulo = (editando.dados && editando.dados.titulo) || "este item";
    if (!window.confirm("Excluir \"" + titulo + "\"? Ele some do portal e não pode ser recuperado.")) return;
    try {
      await api.excluir(editando.id);
      if (editando.dados && editando.dados.thumbnail) api.apagarThumbnail(editando.dados.thumbnail).catch(function () {});
      if (editando.dados && api.ehArquivoDoPortal(editando.dados.url_link)) api.apagarArquivo(editando.dados.url_link).catch(function () {});
      $("#dlg-item").close();
      toast("Item excluído.", "ok");
      itens = await api.itens(lista.id);
      renderTabela();
    } catch (e) {
      erroForm(e.message);
    }
  }

  /* ---------------- eventos ---------------- */

  function ligarEventos() {
    $("#btn-novo-item").addEventListener("click", function () { abrirItem(null); });

    // Listeners para o novo componente de filtros (os elementos antigos foram removidos do HTML)
    // A atualização da tabela é feita via window.updateTableWithFilters() chamada pelo FiltrosModerno

    // Listener para seleção de lista (se houver múltiplas)
    var selLista = $("#sel-lista");
    if (selLista) {
      selLista.addEventListener("change", function (e) { carregarLista(e.target.value); });
    }

    $("#tabela-itens").addEventListener("click", function (e) {
      var ord = e.target.closest("[data-ordenar]");
      if (ord) {
        var chave = ord.getAttribute("data-ordenar");
        ordem.dir = ordem.chave === chave ? -ordem.dir : 1;
        ordem.chave = chave;
        renderTabela();
        return;
      }
      var tr = e.target.closest("tr[data-item]");
      if (tr) abrirItem(itens.filter(function (i) { return i.id === tr.getAttribute("data-item"); })[0]);
    });
    $("#tabela-itens").addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var tr = e.target.closest("tr[data-item]");
      if (tr) abrirItem(itens.filter(function (i) { return i.id === tr.getAttribute("data-item"); })[0]);
    });

    $("#form-item").addEventListener("submit", salvar);
    $("#dlg-item").addEventListener("close", function () {
      if (salvou) return;
      enviadosNaoSalvos.forEach(function (u) { api.apagarArquivo(u).catch(function () {}); });
      enviadosNaoSalvos = [];
    });
    $("#btn-excluir-item").addEventListener("click", excluir);
    $("#thumb-arquivo").addEventListener("change", function (e) {
      usarImagemManual(e.target.files && e.target.files[0]);
      e.target.value = "";
    });
    $("#btn-thumb-trocar").addEventListener("click", function () { thumb.forcarDrop = true; renderThumb(); });
    $("#btn-thumb-auto").addEventListener("click", function () { thumb.forcarDrop = false; avaliarThumb(true); });

    var drop = $("#thumb-drop");
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function () { drop.classList.remove("is-over"); });
    });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      usarImagemManual(e.dataTransfer.files && e.dataTransfer.files[0]);
    });
    /* Ctrl+V com um print na área de transferência, com o formulário aberto. */
    document.addEventListener("paste", function (e) {
      if (!$("#dlg-item").open || !coluna("thumbnail")) return;
      var itensClip = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < itensClip.length; i++) {
        if (itensClip[i].type.indexOf("image/") === 0) {
          e.preventDefault();
          thumb.forcarDrop = false;
          usarImagemManual(itensClip[i].getAsFile());
          return;
        }
      }
    });

    $all("[data-fechar]").forEach(function (btn) {
      btn.addEventListener("click", function () { btn.closest("dialog").close(); });
    });
  }

  window.PortalShell.onReady(async function (state) {
    if (!state.tenant || !state.podeGerenciarConteudo) return; /* o shell já redireciona */
    api = window.PortalData.conteudos;
    tenant = state.tenant;
    ligarEventos();
    try {
      listas = await api.listas(tenant.id);
      if (!listas.length) {
        $("#tabela-itens").innerHTML = '<div class="admin-empty"><p>Este cliente ainda não tem listas configuradas.</p></div>';
        $("#btn-novo-item").disabled = true;
        return;
      }
      var sel = $("#sel-lista");
      sel.innerHTML = listas.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.nome) + "</option>"; }).join("");
      sel.hidden = listas.length < 2;
      await carregarLista(listas[0].id);
    } catch (e) {
      console.error("[Conteúdos]", e);
      $("#tabela-itens").innerHTML = '<div class="admin-empty"><p>Não foi possível carregar os conteúdos: ' + esc(e.message) + "</p></div>";
    }
  });
})();
