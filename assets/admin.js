/*
 * admin.js — Console do Admin (admin.html)
 *
 * Clientes: listar, criar a partir de template, editar nome/logo/telas/ativo.
 * Usuários: listar, criar (Edge Function admin-usuarios), editar nome e
 * vínculos, redefinir senha, bloquear e promover a Admin.
 *
 * Toda permissão é conferida no banco/Edge Function; aqui é só interface.
 */
(function () {
  "use strict";

  var api = null;
  var dados = { tenants: [], usuarios: [], templates: [] };
  var meuId = null;

  var PAPEIS = { operador: "Operador", cliente: "Cliente" };

  /* ---------------- utilitários ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function slugify(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
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

  var toastTimer = null;
  function toast(msg, tipo) {
    var el = $("#admin-toast");
    el.textContent = msg;
    el.className = "admin-toast" + (tipo ? " admin-toast--" + tipo : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, tipo === "erro" ? 7000 : 4500);
  }

  function erroForm(form, msg) {
    var p = $(".admin-form-erro", form);
    p.textContent = msg || "";
    p.hidden = !msg;
  }

  function okForm(form, msg) {
    var p = $(".admin-form-ok", form);
    if (!p) return;
    p.textContent = msg || "";
    p.hidden = !msg;
  }

  function ocupado(form, ativo) {
    $all("button, input, select", form).forEach(function (el) { el.disabled = ativo; });
  }

  function mensagemErro(error) {
    var msg = (error && error.message) || String(error);
    if (/duplicate key.*tenants_slug_key/i.test(msg)) return "Já existe um cliente com esse identificador.";
    if (/tenants_slug_check/i.test(msg)) return "Identificador inválido: use letras minúsculas, números e hífen.";
    return msg;
  }

  /* ---------------- carga ---------------- */

  async function carregar() {
    var res = await Promise.all([api.listarTenants(), api.listarUsuarios(), api.listarTemplates()]);
    dados.tenants = res[0] || [];
    dados.usuarios = res[1] || [];
    dados.templates = res[2] || [];
    renderResumo();
    renderClientes();
    renderUsuarios();
    preencherFiltroClientes();
  }

  function renderResumo() {
    var ativos = dados.tenants.filter(function (t) { return t.ativo; }).length;
    var bloqueados = dados.usuarios.filter(function (u) { return u.bloqueado; }).length;
    var itens = dados.tenants.reduce(function (s, t) { return s + Number(t.itens || 0); }, 0);
    $("#stat-clientes").textContent = ativos;
    $("#stat-clientes-total").textContent = dados.tenants.length + " no total";
    $("#stat-usuarios").textContent = dados.usuarios.length;
    $("#stat-usuarios-bloq").textContent = bloqueados ? bloqueados + " bloqueado(s)" : "nenhum bloqueado";
    $("#stat-itens").textContent = itens;
    $("#tab-count-clientes").textContent = dados.tenants.length;
    $("#tab-count-usuarios").textContent = dados.usuarios.length;
  }

  /* ---------------- clientes ---------------- */

  function telaChips(telas) {
    telas = telas || {};
    return '<span class="admin-chip' + (telas.dashboard === false ? " is-off" : "") + '">Visão geral</span>' +
      '<span class="admin-chip' + (telas.sinistros === false ? " is-off" : "") + '">Sinistros</span>';
  }

  function renderClientes() {
    var termo = slugify($("#busca-clientes").value);
    var lista = dados.tenants.filter(function (t) {
      return !termo || slugify(t.nome).indexOf(termo) !== -1 || t.slug.indexOf(termo) !== -1;
    });
    var box = $("#lista-clientes");
    if (!dados.tenants.length) {
      box.innerHTML = '<div class="admin-empty"><h3>Nenhum cliente ainda</h3><p>Crie o primeiro cliente para começar a cadastrar usuários e conteúdos.</p></div>';
      return;
    }
    if (!lista.length) {
      box.innerHTML = '<div class="admin-empty"><p>Nenhum cliente encontrado para essa busca.</p></div>';
      return;
    }
    box.innerHTML = lista.map(function (t) {
      var logo = t.logo_url
        ? '<img src="' + esc(t.logo_url) + '" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">' +
          '<span class="admin-avatar" hidden>' + esc(iniciais(t.nome)) + "</span>"
        : '<span class="admin-avatar">' + esc(iniciais(t.nome)) + "</span>";
      return '<article class="admin-row' + (t.ativo ? "" : " is-inativo") + '">' +
        '<div class="admin-row-logo">' + logo + "</div>" +
        '<div class="admin-row-main">' +
          '<h3>' + esc(t.nome) + (t.ativo ? "" : ' <span class="admin-badge admin-badge--off">Inativo</span>') + "</h3>" +
          '<p class="admin-row-meta"><code>' + esc(t.slug) + "</code> · modelo " + esc(t.template || "—") + " · criado em " + esc(new Date(t.created_at).toLocaleDateString("pt-BR")) + "</p>" +
          '<div class="admin-chips">' + telaChips(t.telas) + "</div>" +
        "</div>" +
        '<div class="admin-row-nums"><span><strong>' + t.usuarios + "</strong> usuário(s)</span><span><strong>" + t.itens + "</strong> conteúdo(s)</span></div>" +
        '<div class="admin-row-actions">' +
          (t.ativo ? '<button type="button" class="admin-btn admin-btn--ghost" data-abrir="' + esc(t.id) + '">Abrir portal</button>' : "") +
          '<button type="button" class="admin-btn" data-editar-cliente="' + esc(t.id) + '">Editar</button>' +
        "</div></article>";
    }).join("");
  }

  function tenantPorId(id) {
    return dados.tenants.filter(function (t) { return t.id === id; })[0];
  }

  function abrirDialogCliente(tenant) {
    var dlg = $("#dlg-cliente");
    var form = $("#form-cliente");
    form.reset();
    erroForm(form, "");
    form.dataset.id = tenant ? tenant.id : "";
    form.dataset.slugManual = "";
    $("#dlg-cliente-titulo").textContent = tenant ? "Editar cliente" : "Novo cliente";
    $all("[data-so-novo]", form).forEach(function (el) { el.hidden = !!tenant; });
    $all("[data-so-edicao]", form).forEach(function (el) { el.hidden = !tenant; });
    form.slug.required = !tenant;

    form.template.innerHTML = dados.templates.map(function (tp) {
      return '<option value="' + esc(tp.slug) + '">' + esc(tp.nome) + "</option>";
    }).join("");

    if (tenant) {
      form.nome.value = tenant.nome;
      form.tela_dashboard.checked = (tenant.telas || {}).dashboard !== false;
      form.tela_sinistros.checked = (tenant.telas || {}).sinistros !== false;
      form.ativo.checked = tenant.ativo;
    }
    dlg.showModal();
    form.nome.focus();
  }

  async function salvarCliente(event) {
    event.preventDefault();
    var form = event.target;
    var id = form.dataset.id;
    var nome = form.nome.value.trim();
    erroForm(form, "");
    if (!nome) { erroForm(form, "Informe o nome do cliente."); return; }

    ocupado(form, true);
    try {
      if (id) {
        await api.atualizarTenant({
          id: id, nome: nome, logo_url: (tenantPorId(id) || {}).logo_url || "",
          telas: { dashboard: form.tela_dashboard.checked, sinistros: form.tela_sinistros.checked },
          ativo: form.ativo.checked
        });
        toast("Cliente atualizado.", "ok");
      } else {
        var slug = form.slug.value.trim();
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("Identificador inválido: use letras minúsculas, números e hífen.");
        await api.criarTenant({ nome: nome, slug: slug, template: form.template.value });
        toast("Cliente " + nome + " criado com os módulos do modelo.", "ok");
      }
      $("#dlg-cliente").close();
      await carregar();
    } catch (error) {
      erroForm(form, mensagemErro(error));
    } finally {
      ocupado(form, false);
    }
  }

  /* ---------------- usuários ---------------- */

  function preencherFiltroClientes() {
    var sel = $("#filtro-cliente");
    var atual = sel.value;
    sel.innerHTML = '<option value="">Todos os clientes</option><option value="__sem">Sem cliente</option>' +
      dados.tenants.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.nome) + "</option>"; }).join("");
    sel.value = atual;
  }

  function vinculoChips(vinculos) {
    if (!vinculos.length) return '<span class="admin-chip is-off">Sem cliente</span>';
    return vinculos.map(function (v) {
      return '<span class="admin-chip admin-chip--' + esc(v.papel) + (v.ativo ? "" : " is-off") + '">' +
        esc(v.tenant) + " · " + esc(PAPEIS[v.papel] || v.papel) + (v.pode_configurar ? " ⚙" : "") + "</span>";
    }).join("");
  }

  function renderUsuarios() {
    var termo = $("#busca-usuarios").value.trim().toLowerCase();
    var filtro = $("#filtro-cliente").value;
    var lista = dados.usuarios.filter(function (u) {
      var texto = [u.nome, u.email, u.username].join(" ").toLowerCase();
      if (termo && texto.indexOf(termo) === -1) return false;
      if (filtro === "__sem") return !u.vinculos.length;
      if (filtro) return u.vinculos.some(function (v) { return v.tenant_id === filtro; });
      return true;
    });
    var box = $("#lista-usuarios");
    if (!lista.length) {
      box.innerHTML = '<div class="admin-empty"><p>Nenhum usuário encontrado.</p></div>';
      return;
    }
    box.innerHTML = lista.map(function (u) {
      var ident = [u.email, u.username ? "@" + u.username : ""].filter(Boolean).join(" · ");
      return '<article class="admin-row' + (u.bloqueado ? " is-inativo" : "") + '">' +
        '<div class="admin-row-logo"><span class="admin-avatar admin-avatar--user">' + esc(iniciais(u.nome || u.email || u.username)) + "</span></div>" +
        '<div class="admin-row-main">' +
          "<h3>" + esc(u.nome || "(sem nome)") +
            (u.is_platform_admin ? ' <span class="admin-badge">Admin</span>' : "") +
            (u.bloqueado ? ' <span class="admin-badge admin-badge--off">Bloqueado</span>' : "") +
            (u.id === meuId ? ' <span class="admin-badge admin-badge--you">Você</span>' : "") + "</h3>" +
          '<p class="admin-row-meta">' + esc(ident || "—") + "</p>" +
          '<div class="admin-chips">' + vinculoChips(u.vinculos) + "</div>" +
        "</div>" +
        '<div class="admin-row-nums"><span>Último acesso</span><span><strong>' + esc(dataCurta(u.ultimo_acesso)) + "</strong></span></div>" +
        '<div class="admin-row-actions"><button type="button" class="admin-btn" data-editar-usuario="' + esc(u.id) + '">Editar</button></div>' +
        "</article>";
    }).join("");
  }

  /* Linha de vínculo: cliente + papel + "pode configurar" + remover. */
  function linhaVinculo(v) {
    v = v || {};
    var opts = dados.tenants.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (t.id === v.tenant_id ? " selected" : "") + ">" + esc(t.nome) + (t.ativo ? "" : " (inativo)") + "</option>";
    }).join("");
    var div = document.createElement("div");
    div.className = "admin-vinculo";
    div.innerHTML =
      '<select data-campo="tenant" aria-label="Cliente">' + opts + "</select>" +
      '<select data-campo="papel" aria-label="Perfil">' +
        '<option value="cliente" title="Só consulta"' + (v.papel === "operador" ? "" : " selected") + ">Cliente</option>" +
        '<option value="operador" title="Cadastra conteúdo e libera acesso a clientes"' + (v.papel === "operador" ? " selected" : "") + ">Operador</option>" +
      "</select>" +
      '<label class="admin-check admin-check--compact"><input type="checkbox" data-campo="config"' + (v.pode_configurar ? " checked" : "") + "> Pode configurar</label>" +
      '<button type="button" class="admin-btn admin-btn--icon" data-remover aria-label="Remover cliente">&times;</button>';
    function sync() {
      var op = $('[data-campo="papel"]', div).value === "operador";
      var cb = $('[data-campo="config"]', div);
      cb.disabled = !op;
      if (!op) cb.checked = false;
    }
    $('[data-campo="papel"]', div).addEventListener("change", sync);
    $("[data-remover]", div).addEventListener("click", function () { div.remove(); });
    sync();
    return div;
  }

  function lerVinculos(container) {
    var vistos = {};
    var lista = [];
    $all(".admin-vinculo", container).forEach(function (row) {
      var tenantId = $('[data-campo="tenant"]', row).value;
      if (!tenantId) return;
      if (vistos[tenantId]) throw new Error("O mesmo cliente foi adicionado duas vezes.");
      vistos[tenantId] = true;
      var papel = $('[data-campo="papel"]', row).value;
      lista.push({ tenant_id: tenantId, papel: papel, pode_configurar: papel === "operador" && $('[data-campo="config"]', row).checked });
    });
    return lista;
  }

  function abrirNovoUsuario() {
    var form = $("#form-usuario");
    form.reset();
    erroForm(form, "");
    var box = $("#vinculos-novo");
    box.innerHTML = "";
    if (dados.tenants.length) box.appendChild(linhaVinculo({}));
    form.senha.value = gerarSenha();
    $("#dlg-usuario").showModal();
    form.nome.focus();
  }

  async function criarUsuario(event) {
    event.preventDefault();
    var form = event.target;
    erroForm(form, "");
    var payload;
    try {
      payload = {
        nome: form.nome.value.trim(),
        email: form.email.value.trim(),
        username: form.username.value.trim().toLowerCase(),
        senha: form.senha.value,
        admin: form.admin.checked,
        vinculos: lerVinculos($("#vinculos-novo"))
      };
      if (!payload.nome) throw new Error("Informe o nome.");
      if (!payload.email && !payload.username) throw new Error("Informe um e-mail, um usuário ou os dois.");
      if (payload.senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
      if (!payload.vinculos.length && !payload.admin) throw new Error("Adicione ao menos um cliente (ou marque como administrador).");
    } catch (error) {
      erroForm(form, error.message);
      return;
    }

    ocupado(form, true);
    try {
      await api.criarUsuario(payload);
      $("#dlg-usuario").close();
      toast("Usuário criado. Login: " + (payload.email || payload.username) + " · senha provisória: " + payload.senha, "ok");
      await carregar();
    } catch (error) {
      erroForm(form, mensagemErro(error));
    } finally {
      ocupado(form, false);
    }
  }

  var editando = null;

  function abrirEditarUsuario(usuario) {
    editando = usuario;
    var form = $("#form-editar-usuario");
    form.reset();
    erroForm(form, "");
    okForm(form, "");
    $("#editar-identificacao").textContent = [usuario.email, usuario.username ? "@" + usuario.username : ""].filter(Boolean).join(" · ") +
      " · último acesso: " + dataCurta(usuario.ultimo_acesso);
    form.nome.value = usuario.nome || "";
    form.admin.checked = usuario.is_platform_admin;
    var souEu = usuario.id === meuId;
    form.admin.disabled = souEu;
    var box = $("#vinculos-editar");
    box.innerHTML = "";
    usuario.vinculos.forEach(function (v) { box.appendChild(linhaVinculo(v)); });
    var btnBloq = $("#btn-bloquear");
    btnBloq.hidden = souEu;
    btnBloq.textContent = usuario.bloqueado ? "Desbloquear acesso" : "Bloquear acesso";
    btnBloq.classList.toggle("admin-btn--danger", !usuario.bloqueado);
    $("#dlg-editar-usuario").showModal();
  }

  async function salvarUsuario(event) {
    event.preventDefault();
    var form = event.target;
    var u = editando;
    erroForm(form, "");
    okForm(form, "");
    var novos;
    try {
      if (!form.nome.value.trim()) throw new Error("Informe o nome.");
      novos = lerVinculos($("#vinculos-editar"));
    } catch (error) {
      erroForm(form, error.message);
      return;
    }

    ocupado(form, true);
    try {
      if (form.nome.value.trim() !== (u.nome || "")) await api.atualizarNome(u.id, form.nome.value.trim());

      var antes = {};
      u.vinculos.forEach(function (v) { antes[v.tenant_id] = v; });
      var depois = {};
      for (var i = 0; i < novos.length; i++) {
        var v = novos[i];
        depois[v.tenant_id] = true;
        var old = antes[v.tenant_id];
        if (!old || old.papel !== v.papel || Boolean(old.pode_configurar) !== v.pode_configurar || !old.ativo) {
          await api.salvarVinculo({ user_id: u.id, tenant_id: v.tenant_id, papel: v.papel, pode_configurar: v.pode_configurar, ativo: true });
        }
      }
      for (var tid in antes) {
        if (!depois[tid]) await api.removerVinculo(u.id, tid);
      }

      if (!form.admin.disabled && form.admin.checked !== u.is_platform_admin) {
        await api.definirAdmin(u.id, form.admin.checked);
      }
      $("#dlg-editar-usuario").close();
      toast("Usuário atualizado.", "ok");
      await carregar();
    } catch (error) {
      erroForm(form, mensagemErro(error));
    } finally {
      ocupado(form, false);
    }
  }

  async function redefinirSenha() {
    var form = $("#form-editar-usuario");
    var senha = form.nova_senha.value;
    erroForm(form, "");
    okForm(form, "");
    if (senha.length < 8) { erroForm(form, "A nova senha precisa ter pelo menos 8 caracteres."); return; }
    ocupado(form, true);
    try {
      await api.redefinirSenha(editando.id, senha);
      okForm(form, "Senha redefinida. Nova senha provisória: " + senha);
    } catch (error) {
      erroForm(form, mensagemErro(error));
    } finally {
      ocupado(form, false);
      form.admin.disabled = editando.id === meuId;
    }
  }

  async function alternarBloqueio() {
    var form = $("#form-editar-usuario");
    var bloquear = !editando.bloqueado;
    if (bloquear && !window.confirm("Bloquear o acesso de " + (editando.nome || "este usuário") + "? Ele não conseguirá mais entrar até ser desbloqueado.")) return;
    ocupado(form, true);
    try {
      await api.bloquear(editando.id, bloquear);
      $("#dlg-editar-usuario").close();
      toast(bloquear ? "Acesso bloqueado." : "Acesso desbloqueado.", "ok");
      await carregar();
    } catch (error) {
      erroForm(form, mensagemErro(error));
    } finally {
      ocupado(form, false);
    }
  }

  /* ---------------- abas e eventos ---------------- */

  function mostrarSecao(nome) {
    $all("#admin-tabs .module-tab").forEach(function (btn) {
      var ativo = btn.getAttribute("data-secao") === nome;
      btn.classList.toggle("is-active", ativo);
      btn.setAttribute("aria-selected", String(ativo));
      btn.tabIndex = ativo ? 0 : -1;
    });
    $("#secao-clientes").hidden = nome !== "clientes";
    $("#secao-usuarios").hidden = nome !== "usuarios";
    if (window.history.replaceState) window.history.replaceState(null, "", "admin.html#" + nome);
  }

  function ligarEventos() {
    $("#admin-tabs").addEventListener("click", function (e) {
      var btn = e.target.closest(".module-tab");
      if (btn) mostrarSecao(btn.getAttribute("data-secao"));
    });

    $("#busca-clientes").addEventListener("input", renderClientes);
    $("#busca-usuarios").addEventListener("input", renderUsuarios);
    $("#filtro-cliente").addEventListener("change", renderUsuarios);

    $("#btn-novo-cliente").addEventListener("click", function () { abrirDialogCliente(null); });
    $("#btn-novo-usuario").addEventListener("click", abrirNovoUsuario);

    $("#lista-clientes").addEventListener("click", function (e) {
      var editar = e.target.closest("[data-editar-cliente]");
      if (editar) {
        abrirDialogCliente(dados.tenants.filter(function (t) { return t.id === editar.getAttribute("data-editar-cliente"); })[0]);
        return;
      }
      var abrir = e.target.closest("[data-abrir]");
      if (abrir) {
        window.PortalData.setActiveTenantId(abrir.getAttribute("data-abrir"));
        window.location.href = "dashboard.html";
      }
    });

    $("#lista-usuarios").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-editar-usuario]");
      if (btn) abrirEditarUsuario(dados.usuarios.filter(function (u) { return u.id === btn.getAttribute("data-editar-usuario"); })[0]);
    });

    var formCliente = $("#form-cliente");
    formCliente.addEventListener("submit", salvarCliente);
    formCliente.nome.addEventListener("input", function () {
      if (!formCliente.dataset.id && !formCliente.dataset.slugManual) formCliente.slug.value = slugify(formCliente.nome.value);
    });
    formCliente.slug.addEventListener("input", function () { formCliente.dataset.slugManual = "1"; });

    $("#form-usuario").addEventListener("submit", criarUsuario);
    $("#form-editar-usuario").addEventListener("submit", salvarUsuario);
    $("#btn-add-vinculo").addEventListener("click", function () { $("#vinculos-novo").appendChild(linhaVinculo({})); });
    $("#btn-add-vinculo-editar").addEventListener("click", function () { $("#vinculos-editar").appendChild(linhaVinculo({})); });
    $("#btn-gerar-senha").addEventListener("click", function () { $("#form-usuario").senha.value = gerarSenha(); });
    $("#btn-gerar-senha-editar").addEventListener("click", function () { $("#form-editar-usuario").nova_senha.value = gerarSenha(); });
    $("#btn-redefinir-senha").addEventListener("click", redefinirSenha);
    $("#btn-bloquear").addEventListener("click", alternarBloqueio);

    $all("[data-fechar]").forEach(function (btn) {
      btn.addEventListener("click", function () { btn.closest("dialog").close(); });
    });
  }

  window.PortalShell.onReady(async function (state) {
    if (!state.isAdmin) return; /* o shell já redireciona quem não é Admin */
    api = window.PortalData.admin;
    meuId = state.profile.id;
    ligarEventos();
    mostrarSecao(window.location.hash === "#usuarios" ? "usuarios" : "clientes");
    try {
      await carregar();
    } catch (error) {
      console.error("[Admin]", error);
      $("#lista-clientes").innerHTML = '<div class="admin-empty"><p>Não foi possível carregar os dados: ' + esc(mensagemErro(error)) + "</p></div>";
    }
  });
})();
