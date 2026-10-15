/*
 * configuracoes.js — Configurações do portal do cliente (configuracoes.html)
 *
 * Operador com "pode configurar" (ou Admin) ajusta a identidade do cliente:
 * nome, logo (upload para o Storage, bucket "logos") e telas visíveis.
 * A permissão é conferida no banco (RLS + grants de coluna).
 */
(function () {
  "use strict";

  var MAX_BYTES = 10 * 1024 * 1024; /* antes da compressão (vai para ~512 px WEBP) */
  var TIPOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

  var tenant = null;
  var logoAtual = "";      /* URL salva no banco */
  var logoNova = null;     /* File escolhido e ainda não enviado */
  var logoRemovida = false;
  var previewUrl = null;

  function $(sel) { return document.querySelector(sel); }

  function toast(msg, tipo) {
    var el = $("#admin-toast");
    el.textContent = msg;
    el.className = "admin-toast" + (tipo ? " admin-toast--" + tipo : "");
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.hidden = true; }, 4500);
  }

  function erro(msg) {
    var p = $("#form-config .admin-form-erro");
    p.textContent = msg || "";
    p.hidden = !msg;
  }

  function mostrarLogo(url) {
    var box = $("#logo-preview");
    var old = box.querySelector("img");
    if (old) old.remove();
    $("#logo-inicial").hidden = !!url;
    $("#btn-remover-logo").hidden = !url;
    if (!url) return;
    var img = document.createElement("img");
    img.alt = "Logo do cliente";
    img.src = url;
    img.onerror = function () { img.remove(); $("#logo-inicial").hidden = false; };
    box.appendChild(img);
  }

  function preencher() {
    var form = $("#form-config");
    form.nome.value = tenant.nome;
    form.tela_dashboard.checked = (tenant.telas || {}).dashboard !== false;
    form.tela_sinistros.checked = (tenant.telas || {}).sinistros !== false;
    $("#logo-inicial").textContent = (tenant.nome || "?").charAt(0).toUpperCase();
    logoAtual = tenant.logo_url || "";
    logoNova = null;
    logoRemovida = false;
    mostrarLogo(logoAtual);
    erro("");
  }

  function escolherArquivo(event) {
    var arquivo = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!arquivo) return;
    if (TIPOS.indexOf(arquivo.type) === -1) { erro("Formato não aceito. Use PNG, JPG, WEBP, SVG ou GIF."); return; }
    if (arquivo.size > MAX_BYTES) { erro("A imagem tem mais de 10 MB. Reduza o tamanho e tente de novo."); return; }
    erro("");
    logoNova = arquivo;
    logoRemovida = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(arquivo);
    mostrarLogo(previewUrl);
  }

  async function salvar(event) {
    event.preventDefault();
    var form = event.target;
    var nome = form.nome.value.trim();
    erro("");
    if (!nome) { erro("Informe o nome do cliente."); return; }

    var botoes = form.querySelectorAll("button, input");
    botoes.forEach(function (b) { b.disabled = true; });
    var cfg = window.PortalData.configuracao;
    var anterior = logoAtual;
    var enviada = null;
    try {
      var logoFinal = logoRemovida ? "" : logoAtual;
      if (logoNova) {
        enviada = await cfg.enviarLogo(tenant.id, logoNova);
        logoFinal = enviada;
      }
      await cfg.salvar(tenant.id, {
        nome: nome,
        logo_url: logoFinal,
        telas: { dashboard: form.tela_dashboard.checked, sinistros: form.tela_sinistros.checked }
      });
      if (anterior && anterior !== logoFinal) {
        cfg.apagarLogo(anterior).catch(function () {});
      }
      toast("Configurações salvas.", "ok");
      /* Recarrega para o topo e o menu refletirem o novo nome, logo e telas. */
      window.PortalShell.limparCache();
      setTimeout(function () { window.location.reload(); }, 700);
    } catch (e) {
      if (enviada) cfg.apagarLogo(enviada).catch(function () {});
      var msg = (e && e.message) || String(e);
      if (/row-level security|permission denied|0 rows|JSON object requested/i.test(msg)) {
        msg = "Você não tem permissão para alterar as configurações deste cliente.";
      }
      erro(msg);
      botoes.forEach(function (b) { b.disabled = false; });
    }
  }

  window.PortalShell.onReady(function (state) {
    if (!state.tenant || !state.podeConfigurar) return; /* o shell já redireciona */
    tenant = state.tenant;
    preencher();
    $("#logo-arquivo").addEventListener("change", escolherArquivo);
    $("#btn-remover-logo").addEventListener("click", function () {
      logoNova = null;
      logoRemovida = true;
      mostrarLogo("");
    });
    $("#btn-descartar").addEventListener("click", preencher);
    $("#form-config").addEventListener("submit", salvar);
  });
})();
