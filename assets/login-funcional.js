/*
 * login-funcional.js
 * Login do portal via Supabase (assets/portal-data.js).
 *
 * - Campo único "E-mail ou usuário"
 * - Depois de autenticar: 1 cliente → dashboard; vários → seletor de cliente
 * - index.html?trocar=1 com sessão ativa → abre direto o seletor
 */
(function () {
  "use strict";

  var PICKER_STYLE =
    ".tenant-picker{display:grid;gap:10px}" +
    ".tenant-picker h2{margin:0 0 4px;font-size:18px}" +
    ".tenant-picker p{margin:0 0 6px;font-size:13px;opacity:.75}" +
    ".tenant-option{display:flex;align-items:center;gap:12px;width:100%;text-align:left;font:inherit;" +
    "padding:12px 14px;border-radius:12px;border:1px solid rgba(15,40,80,.14);background:#fff;color:#14263f;cursor:pointer;" +
    "transition:border-color .18s ease,box-shadow .18s ease}" +
    ".tenant-option:hover,.tenant-option:focus-visible{border-color:#2f6fed;box-shadow:0 8px 20px -10px rgba(47,111,237,.6);outline:none}" +
    ".tenant-option img{width:36px;height:36px;object-fit:contain;border-radius:8px;background:#f2f5fa}" +
    ".tenant-option .tenant-initial{width:36px;height:36px;border-radius:8px;display:grid;place-items:center;background:#e9eff7;font-weight:700}" +
    ".tenant-option small{display:block;opacity:.65;font-size:11.5px;text-transform:capitalize}" +
    ".tenant-picker .tenant-logout{justify-self:start;background:none;border:0;padding:4px 0;font:inherit;font-size:13px;color:inherit;opacity:.75;cursor:pointer;text-decoration:underline}";

  function escapeHTML(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function initializeLogin() {
    applyExternalBrandAssets();
    var form = document.getElementById("login-form");
    var loginField = document.getElementById("login");
    var passwordField = document.getElementById("password");
    var submitButton = form && form.querySelector(".submit-button");
    var eyeButton = form && form.querySelector(".eye-button");
    var rememberField = form && form.querySelector('input[name="remember"]');
    if (!form || !loginField || !passwordField || !submitButton) return;

    var label = form.querySelector('label[for="login"]');
    if (label) label.textContent = "E-mail ou usuário";
    loginField.placeholder = "Digite seu e-mail ou usuário";

    function showMessage(text, type) {
      var node = form.querySelector(".message");
      if (!node) {
        node = document.createElement("p");
        form.appendChild(node);
      }
      node.className = "message " + type;
      node.setAttribute("role", type === "error" ? "alert" : "status");
      node.textContent = text;
    }

    function setLoading(active) {
      loginField.disabled = active;
      passwordField.disabled = active;
      submitButton.disabled = active;
      submitButton.innerHTML = active
        ? "<span>VALIDANDO...</span>"
        : '<span>ENTRAR</span><span aria-hidden="true">→</span>';
    }

    function goTo(tenant) {
      window.PortalData.setActiveTenantId(tenant.id);
      window.location.href = "dashboard.html";
    }

    /* Troca o formulário pelo seletor de cliente. */
    function showTenantPicker(tenants) {
      if (!document.getElementById("tenant-picker-style")) {
        var style = document.createElement("style");
        style.id = "tenant-picker-style";
        style.textContent = PICKER_STYLE;
        document.head.appendChild(style);
      }
      Array.prototype.forEach.call(form.children, function (child) { child.hidden = true; });
      var picker = document.createElement("div");
      picker.className = "tenant-picker";
      picker.innerHTML =
        "<h2>Escolha o cliente</h2><p>Sua conta tem acesso a mais de um cliente.</p>" +
        tenants.map(function (t, i) {
          var logo = t.logo_url
            ? '<img src="' + escapeHTML(t.logo_url) + '" alt="">'
            : '<span class="tenant-initial">' + escapeHTML(t.nome.charAt(0).toUpperCase()) + "</span>";
          return '<button type="button" class="tenant-option" data-index="' + i + '">' + logo +
            "<span><strong>" + escapeHTML(t.nome) + "</strong><small>" + escapeHTML(t.papel) + "</small></span></button>";
        }).join("") +
        '<button type="button" class="tenant-logout">Entrar com outra conta</button>';
      form.appendChild(picker);
      picker.addEventListener("click", async function (event) {
        var option = event.target.closest(".tenant-option");
        if (option) { goTo(tenants[Number(option.getAttribute("data-index"))]); return; }
        if (event.target.closest(".tenant-logout")) {
          await window.PortalData.signOut();
          window.location.replace("index.html");
        }
      });
      var first = picker.querySelector(".tenant-option");
      if (first) first.focus();
    }

    /* Depois de autenticado: decide entre dashboard direto ou seletor. */
    async function routeAfterLogin(forcePicker) {
      var session = await window.PortalData.getSession();
      if (!session) return false;
      var profile = await window.PortalData.loadProfile(session.user.id);
      var tenants = await window.PortalData.listTenants(profile);
      if (!tenants.length) {
        await window.PortalData.signOut();
        showMessage("Sua conta ainda não tem acesso a nenhum cliente. Fale com o administrador.", "error");
        return true;
      }
      var stored = window.PortalData.getActiveTenantId();
      var current = tenants.filter(function (t) { return t.id === stored; })[0];
      if (tenants.length === 1) { goTo(tenants[0]); return true; }
      if (current && !forcePicker) { goTo(current); return true; }
      showTenantPicker(tenants);
      return true;
    }

    form.addEventListener(
      "submit",
      async function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        var login = loginField.value.trim();
        var senha = passwordField.value;

        if (!login || !senha) {
          showMessage(
            !login && !senha
              ? "Informe seu e-mail ou usuário e sua senha."
              : !login
                ? "Informe seu e-mail ou usuário."
                : "Informe sua senha.",
            "error",
          );
          return;
        }

        setLoading(true);
        try {
          var result = await window.PortalData.signIn(login, senha);
          if (result.error) {
            showMessage(result.error, "error");
            return;
          }
          if (rememberField && rememberField.checked) {
            localStorage.setItem("portalLoginLembrado", login);
          } else {
            localStorage.removeItem("portalLoginLembrado");
          }
          showMessage("Acesso autorizado.", "success");
          await routeAfterLogin(true);
        } catch (error) {
          console.error(error);
          showMessage("Não foi possível validar o acesso. Verifique sua conexão e tente novamente.", "error");
        } finally {
          setLoading(false);
        }
      },
      true,
    );

    if (eyeButton) {
      eyeButton.addEventListener(
        "click",
        function (event) {
          event.preventDefault();
          event.stopImmediatePropagation();
          var isVisible = passwordField.type === "text";
          passwordField.type = isVisible ? "password" : "text";
          eyeButton.setAttribute("aria-pressed", String(!isVisible));
          eyeButton.setAttribute(
            "aria-label",
            isVisible ? "Mostrar senha" : "Ocultar senha",
          );
        },
        true,
      );
    }

    var savedLogin = localStorage.getItem("portalLoginLembrado");
    if (savedLogin) {
      loginField.value = savedLogin;
      if (rememberField) rememberField.checked = true;
    }

    /* Já autenticado? Vai direto (ou abre o seletor em ?trocar=1). */
    var trocar = new URLSearchParams(window.location.search).get("trocar") === "1";
    routeAfterLogin(trocar).catch(function (error) {
      console.error("[Portal] Falha ao verificar a sessão:", error);
    });
  }

  function applyExternalBrandAssets() {
    var base = "https://repositorio-apisul.github.io/mondelez/";
    document.querySelectorAll('img[src$="logo-apisul-branca.png"]').forEach(function (image) {
      image.src = base + "logo-apisul-branca.png";
    });
    document.querySelectorAll('img[src$="logo-piscina-branca.png"]').forEach(function (image) {
      image.src = base + "logo-piscina-branca.png";
    });
    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(function (icon) {
      icon.href = base + "icone-apisul.png";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLogin, { once: true });
  } else {
    initializeLogin();
  }
})();
