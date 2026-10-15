/*
 * usuarios.js — Usuários do portal do cliente (usuarios.html)
 *
 * Operador (ou Admin dentro do cliente) libera acesso de usuários do tipo
 * Cliente: cria o login, redefine senha, bloqueia e remove o acesso.
 * Operadores aparecem na lista, mas só o Admin os gerencia.
 * Permissões conferidas no banco e na Edge Function admin-usuarios.
 */
(function () {
  "use strict";

  var api = null;
  var tenant = null;
  var meuId = null;
  var usuarios = [];
  var atual = null;

  function $(sel) { return document.querySelector(sel); }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function iniciais(nome) {
    return String(nome || "?").split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (p) { return p.charAt(0); }).join("").toUpperCase() || "?";
  }

  function dataCurta(iso) {
    if (!iso) return "nunca";
    var d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function gerarSenha() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    var arr = new Uint32Array(12);
    window.crypto.getRandomValues(arr);
    return Array.prototype.map.call(arr, function (n) { return chars[n % chars.length]; }).join("");
  }

  function toast(msg, tipo) {
    var el = $("#admin-toast");
    el.textContent = msg;
    el.className = "admin-toast" + (tipo ? " admin-toast--" + tipo : "");
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.hidden = true; }, tipo === "erro" ? 7000 : 6000);
  }

  function aviso(form, seletor, msg) {
    var p = form.querySelector(seletor);
    p.textContent = msg || "";
    p.hidden = !msg;
  }

  function ocupado(form, ativo) {
    form.querySelectorAll("button, input").forEach(function (el) { el.disabled = ativo; });
  }

  /* ---------------- lista ---------------- */

  async function carregar() {
    usuarios = await api.listar(tenant.id) || [];
    render();
  }

  function render() {
    var termo = $("#busca-usuarios").value.trim().toLowerCase();
    var lista = usuarios.filter(function (u) {
      return !termo || [u.nome, u.email, u.username].join(" ").toLowerCase().indexOf(termo) !== -1;
    });
    var box = $("#lista-usuarios");
    if (!usuarios.length) {
      box.innerHTML = '<div class="admin-empty"><h3>Ninguém com acesso ainda</h3><p>Crie o primeiro usuário cliente para liberar o portal.</p></div>';
      return;
    }
    if (!lista.length) {
      box.innerHTML = '<div class="admin-empty"><p>Nenhum usuário encontrado para essa busca.</p></div>';
      return;
    }
    box.innerHTML = lista.map(function (u) {
      var ident = [u.email, u.username ? "@" + u.username : ""].filter(Boolean).join(" · ");
      var operador = u.papel === "operador";
      var acao = operador || u.id === meuId
        ? '<span class="admin-row-note">' + (u.id === meuId ? "Você" : "Gerenciado pelo Admin") + "</span>"
        : '<button type="button" class="admin-btn" data-gerenciar="' + esc(u.id) + '">Gerenciar</button>';
      return '<article class="admin-row' + (u.bloqueado || !u.ativo ? " is-inativo" : "") + '">' +
        '<div class="admin-row-logo"><span class="admin-avatar admin-avatar--user">' + esc(iniciais(u.nome || u.email || u.username)) + "</span></div>" +
        '<div class="admin-row-main">' +
          "<h3>" + esc(u.nome || "(sem nome)") +
            (u.bloqueado ? ' <span class="admin-badge admin-badge--off">Bloqueado</span>' : "") +
            (u.id === meuId ? ' <span class="admin-badge admin-badge--you">Você</span>' : "") + "</h3>" +
          '<p class="admin-row-meta">' + esc(ident || "—") + "</p>" +
          '<div class="admin-chips"><span class="admin-chip admin-chip--' + esc(u.papel) + '">' +
            (operador ? "Operador" + (u.pode_configurar ? " ⚙" : "") : "Cliente") + "</span></div>" +
        "</div>" +
        '<div class="admin-row-nums"><span>Último acesso</span><span><strong>' + esc(dataCurta(u.ultimo_acesso)) + "</strong></span></div>" +
        '<div class="admin-row-actions">' + acao + "</div>" +
        "</article>";
    }).join("");
  }

  /* ---------------- novo usuário cliente ---------------- */

  function abrirNovo() {
    var form = $("#form-usuario");
    form.reset();
    aviso(form, ".admin-form-erro", "");
    $("#novo-usuario-cliente").textContent = "Terá acesso de consulta ao portal " + tenant.nome + ".";
    form.senha.value = gerarSenha();
    $("#dlg-usuario").showModal();
    form.nome.focus();
  }

  async function criar(event) {
    event.preventDefault();
    var form = event.target;
    var dados = {
      nome: form.nome.value.trim(),
      email: form.email.value.trim(),
      username: form.username.value.trim().toLowerCase(),
      senha: form.senha.value
    };
    aviso(form, ".admin-form-erro", "");
    if (!dados.nome) { aviso(form, ".admin-form-erro", "Informe o nome."); return; }
    if (!dados.email && !dados.username) { aviso(form, ".admin-form-erro", "Informe um e-mail, um usuário ou os dois."); return; }
    if (dados.senha.length < 8) { aviso(form, ".admin-form-erro", "A senha precisa ter pelo menos 8 caracteres."); return; }

    ocupado(form, true);
    try {
      await api.criarCliente(tenant.id, dados);
      $("#dlg-usuario").close();
      toast("Usuário criado. Login: " + (dados.email || dados.username) + " · senha provisória: " + dados.senha, "ok");
      await carregar();
    } catch (error) {
      aviso(form, ".admin-form-erro", error.message);
    } finally {
      ocupado(form, false);
    }
  }

  /* ---------------- gerenciar usuário cliente ---------------- */

  function abrirGerenciar(usuario) {
    atual = usuario;
    var form = $("#form-gerenciar");
    form.reset();
    aviso(form, ".admin-form-erro", "");
    aviso(form, ".admin-form-ok", "");
    $("#dlg-gerenciar-titulo").textContent = usuario.nome || "Usuário";
    $("#gerenciar-identificacao").textContent = [usuario.email, usuario.username ? "@" + usuario.username : ""].filter(Boolean).join(" · ") +
      " · último acesso: " + dataCurta(usuario.ultimo_acesso);
    $("#btn-bloquear").textContent = usuario.bloqueado ? "Desbloquear" : "Bloquear";
    $("#dlg-gerenciar").showModal();
  }

  async function redefinirSenha() {
    var form = $("#form-gerenciar");
    var senha = form.nova_senha.value;
    aviso(form, ".admin-form-erro", "");
    aviso(form, ".admin-form-ok", "");
    if (senha.length < 8) { aviso(form, ".admin-form-erro", "A nova senha precisa ter pelo menos 8 caracteres."); return; }
    ocupado(form, true);
    try {
      await api.redefinirSenha(atual.id, senha);
      aviso(form, ".admin-form-ok", "Senha redefinida. Nova senha provisória: " + senha);
    } catch (error) {
      aviso(form, ".admin-form-erro", error.message);
    } finally {
      ocupado(form, false);
    }
  }

  async function alternarBloqueio() {
    var form = $("#form-gerenciar");
    var bloquear = !atual.bloqueado;
    if (bloquear && !window.confirm("Bloquear o acesso de " + (atual.nome || "este usuário") + "? Ele não conseguirá entrar até ser desbloqueado.")) return;
    ocupado(form, true);
    try {
      await api.bloquear(atual.id, bloquear);
      $("#dlg-gerenciar").close();
      toast(bloquear ? "Acesso bloqueado." : "Acesso desbloqueado.", "ok");
      await carregar();
    } catch (error) {
      aviso(form, ".admin-form-erro", error.message);
    } finally {
      ocupado(form, false);
    }
  }

  async function removerAcesso() {
    var form = $("#form-gerenciar");
    if (!window.confirm("Remover o acesso de " + (atual.nome || "este usuário") + " ao portal " + tenant.nome + "? O login continua existindo, mas ele deixa de ver este cliente.")) return;
    ocupado(form, true);
    try {
      await api.removerAcesso(atual.id, tenant.id);
      $("#dlg-gerenciar").close();
      toast("Acesso removido.", "ok");
      await carregar();
    } catch (error) {
      aviso(form, ".admin-form-erro", error.message);
    } finally {
      ocupado(form, false);
    }
  }

  window.PortalShell.onReady(async function (state) {
    if (!state.tenant || !state.podeGerenciarUsuarios) return; /* o shell já redireciona */
    api = window.PortalData.equipe;
    tenant = state.tenant;
    meuId = state.profile.id;

    $("#busca-usuarios").addEventListener("input", render);
    $("#btn-novo-usuario").addEventListener("click", abrirNovo);
    $("#form-usuario").addEventListener("submit", criar);
    $("#btn-gerar-senha").addEventListener("click", function () { $("#form-usuario").senha.value = gerarSenha(); });
    $("#btn-gerar-senha-2").addEventListener("click", function () { $("#form-gerenciar").nova_senha.value = gerarSenha(); });
    $("#btn-redefinir-senha").addEventListener("click", redefinirSenha);
    $("#btn-bloquear").addEventListener("click", alternarBloqueio);
    $("#btn-remover-acesso").addEventListener("click", removerAcesso);
    $("#form-gerenciar").addEventListener("submit", function (e) { e.preventDefault(); });
    $("#lista-usuarios").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-gerenciar]");
      if (btn) abrirGerenciar(usuarios.filter(function (u) { return u.id === btn.getAttribute("data-gerenciar"); })[0]);
    });
    document.querySelectorAll("[data-fechar]").forEach(function (btn) {
      btn.addEventListener("click", function () { btn.closest("dialog").close(); });
    });

    try {
      await carregar();
    } catch (error) {
      console.error("[Usuários]", error);
      $("#lista-usuarios").innerHTML = '<div class="admin-empty"><p>Não foi possível carregar os usuários: ' + esc(error.message) + "</p></div>";
    }
  });
})();
