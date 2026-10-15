/*
 * app-shell.js
 * Núcleo reutilizável do "chrome" interno do portal (sidebar, topbar,
 * identidade do cliente/usuário, logout, menu mobile, navegação ativa).
 *
 * Sessão e dados vêm do Supabase (assets/portal-data.js):
 * - sem sessão válida → index.html
 * - sem tenant escolhido → index.html?trocar=1 (seletor de cliente)
 * - menu montado a partir dos módulos visíveis do tenant + telas ligadas
 * - logout encerra a sessão no Supabase e volta para index.html
 * - ao terminar, dispara o evento "portal:ready" com os dados da página
 *
 * Usado por: dashboard.html, modulo.html, sinistros.html
 */
(function (window, document) {
  "use strict";

  var LOGOUT_KEYS = [
    "portalUsuario", "portalAutenticado", "usuarioLogado",
    "nome", "nomeUsuario", "userName", "usuarioNome",
    "foto", "fotoUsuario", "userPhoto", "imagem",
    "nomeCliente", "clienteNome", "cliente", "clientName",
    "logoCliente", "clienteLogo", "logoUrl", "clientLogo",
    "vertente", "perfil", "itensPortal", "itensProcessos"
  ];

  /*
   * Se o SharePoint/Power Automate devolver a logo como caminho relativo
   * (ex.: "/sites/Portal/SiteAssets/logo.png", sem o domínio), configure aqui
   * a URL base do seu tenant para que a imagem seja resolvida corretamente.
   * Deixe como "" se o campo logoCliente já vier sempre com endereço completo
   * (https://...). Pode também ser definida antes deste script via:
   *   <script>window.PORTAL_SHAREPOINT_ORIGIN = "https://suaempresa.sharepoint.com";</script>
   */
  var SHAREPOINT_ORIGIN = window.PORTAL_SHAREPOINT_ORIGIN || "";

  function resolveUrl(url) {
    if (!url) return "";
    url = String(url).trim();
    if (!url) return "";
    // já é absoluta (http://, https://, //cdn, data:, blob:)
    if (/^(https?:)?\/\//i.test(url) || /^(data|blob):/i.test(url)) return url;
    // caminho relativo ao site (ex.: /sites/Portal/SiteAssets/logo.png)
    if (url.charAt(0) === "/") {
      if (SHAREPOINT_ORIGIN) return SHAREPOINT_ORIGIN.replace(/\/$/, "") + url;
      console.warn(
        "[Portal] logoCliente veio como caminho relativo (\"" + url + "\") sem domínio. " +
        "Defina window.PORTAL_SHAREPOINT_ORIGIN com a URL do seu SharePoint para a logo carregar."
      );
      return "";
    }
    return url;
  }

  /* Estado da página, preenchido por init() a partir do Supabase. */
  var state = null;

  function readSessionData() {
    return state || {
      authenticated: false, name: "Usuário", client: "Cliente", clientLogo: "",
      photo: "", perfil: "", modulos: [], telas: {}, tenants: [],
      itensPortal: [], itensProcessos: []
    };
  }

  var LOGO_APISUL = "https://repositorio-apisul.github.io/mondelez/icone-apisul.png";

  var ICONES_MODULO = {
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.6 3.2 8.4 8 9 4.8-.6 8-4.4 8-9V6l-8-3Z"/><path d="m9.5 12 2 2 3.5-3.5"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v8H3z"/><path d="M14 10h4l3 3v2h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1v-9"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
    cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>'
  };

  function moduleIcon(name) { return ICONES_MODULO[name] || ICONES_MODULO.grid; }

  function moduleHref(slug) { return "modulo.html?modulo=" + encodeURIComponent(slug); }

  /* Nome da página com ".html", mesmo quando o servidor usa URLs limpas (/modulo). */
  function currentPage() {
    var page = (window.location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
    return page.indexOf(".") === -1 ? page + ".html" : page;
  }

  function currentModuleSlug() {
    var params = new URLSearchParams(window.location.search);
    return params.get("modulo") || params.get("m") || ""; /* "m" = endereço antigo */
  }

  function escapeAttr(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function homePage(data) {
    if (!data.tenant) return data.isAdmin ? "admin.html" : "index.html?trocar=1";
    if (data.telas.dashboard !== false) return "dashboard.html";
    if (data.modulos.length) return moduleHref(data.modulos[0].slug);
    if (data.telas.sinistros !== false) return "sinistros.html";
    return "dashboard.html";
  }

  /* Monta o menu lateral: Visão geral + módulos do tenant + Sinistros
     (+ Configurações para quem pode configurar o tenant)
     (+ Administração para o Admin da plataforma).
     Na própria Administração o menu mostra só a plataforma. */
  function buildNav(data) {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var html = "";
    if (currentPage() === "admin.html") {
      nav.innerHTML = '<a class="nav-admin" href="admin.html">' + ICONES_MODULO.cog + '<span>Administração</span></a>';
      return;
    }
    if (data.tenant && data.telas.dashboard !== false) {
      html += '<a href="dashboard.html">' + ICONES_MODULO.home + '<span>Visão geral</span></a>';
    }
    data.modulos.forEach(function (m) {
      html += '<a data-module="' + escapeAttr(m.slug) + '" href="' + moduleHref(m.slug) + '">' + moduleIcon(m.icone) + '<span>' + escapeAttr(m.nome) + '</span></a>';
    });
    if (data.tenant && data.telas.sinistros !== false) {
      html += '<a data-module="sinistros" href="sinistros.html">' + ICONES_MODULO.file + '<span>Portal de Sinistros</span></a>';
    }
    if (data.tenant && data.podeConfigurar) {
      html += '<a href="configuracoes.html">' + ICONES_MODULO.sliders + '<span>Configurações</span></a>';
    }
    if (data.isAdmin) {
      html += '<a class="nav-admin" href="admin.html">' + ICONES_MODULO.cog + '<span>Administração</span></a>';
    }
    nav.innerHTML = html;
  }

  /* Bloqueia telas desligadas/inexistentes e ajusta atalhos [data-module]
     (cards da dashboard) para os módulos que o tenant realmente tem. */
  function applyModuleAccess(data) {
    var page = currentPage();
    var slugs = data.modulos.map(function (m) { return m.slug; });
    var bloqueada =
      (page === "admin.html" && !data.isAdmin) ||
      (page === "configuracoes.html" && !data.podeConfigurar) ||
      (page !== "admin.html" && !data.tenant) ||
      (page === "dashboard.html" && data.telas.dashboard === false) ||
      (page === "sinistros.html" && data.telas.sinistros === false) ||
      (page === "modulo.html" && (slugs.indexOf(currentModuleSlug()) === -1 || !data.modulo));
    if (bloqueada) {
      var destino = homePage(data);
      if (destino.toLowerCase() !== page) {
        window.location.replace(destino);
        return false;
      }
    }

    document.querySelectorAll("[data-module]").forEach(function (element) {
      var slug = element.getAttribute("data-module");
      if (slug === "sinistros") {
        element.hidden = data.telas.sinistros === false;
        return;
      }
      element.hidden = slugs.indexOf(slug) === -1;
      if (element.tagName === "A" && !element.closest(".nav")) element.setAttribute("href", moduleHref(slug));
    });
    return true;
  }

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0); }).join("").toUpperCase() || "U";
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function fillLogo(boxId, url, altPrefix, label) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var fallback = box.querySelector("span");
    var previousLogo = box.querySelector("img[data-client-logo]");
    if (previousLogo) previousLogo.remove();
    if (fallback) fallback.hidden = false;
    if (!url) {
      console.info("[Portal] logoCliente vazio para \"" + label + "\" — exibindo inicial no lugar da logo.");
      return;
    }
    var img = document.createElement("img");
    img.setAttribute("data-client-logo", "");
    img.src = url;
    img.alt = altPrefix + " " + label;
    img.onload = function () {
      if (fallback) fallback.hidden = true;
    };
    img.onerror = function () {
      console.warn(
        "[Portal] Falha ao carregar a logo do cliente em: " + url +
        " — verifique se o endereço é público/absoluto (sem exigir login do SharePoint) e se o CORS permite carregá-lo neste domínio. Exibindo inicial como fallback."
      );
      if (fallback) fallback.hidden = false;
      img.remove();
    };
    box.appendChild(img);
  }

  function populateIdentity(data) {
    var label = document.querySelector(".client-badge small");
    if (label && data.clientLabel) label.textContent = data.clientLabel;
    setText("topbar-user-name", data.name);
    setText("client-name", data.client);
    setText("sidebar-client-name", data.client);
    document.title = document.title.replace(/\s*\|\s*.*$/, "") + " | " + data.client;

    var clientInitialChar = data.client.charAt(0).toUpperCase() || "C";
    setText("client-initial", clientInitialChar);
    setText("sidebar-client-initial", clientInitialChar);
    fillLogo("client-logo", data.clientLogo, "Logo", data.client);
    fillLogo("sidebar-client-logo", data.clientLogo, "Logo", data.client);

    var greeting = document.getElementById("greeting");
    if (greeting) {
      var hour = new Date().getHours();
      var saudacao = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
      greeting.textContent = saudacao + ", " + data.name.split(" ")[0] + ".";
    }

    var avatar = document.getElementById("topbar-user-avatar");
    if (avatar) {
      if (data.photo) {
        var img = document.createElement("img");
        img.src = data.photo;
        img.alt = "Foto de " + data.name;
        img.onerror = function () { avatar.innerHTML = "<span>" + initials(data.name) + "</span>"; };
        avatar.innerHTML = "";
        avatar.appendChild(img);
      } else {
        avatar.innerHTML = "<span>" + initials(data.name) + "</span>";
      }
    }
  }

  function bindLogout() {
    var btn = document.getElementById("logout-button");
    if (!btn) return;
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      LOGOUT_KEYS.forEach(function (key) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
      if (window.PortalData) await window.PortalData.signOut();
      window.location.assign("index.html");
    });
  }

  function markActiveNav() {
    var current = (currentPage() + (currentPage() === "modulo.html" ? "?modulo=" + encodeURIComponent(currentModuleSlug()) : "")).toLowerCase();
    var links = document.querySelectorAll(".nav a");
    links.forEach(function (link) {
      var href = (link.getAttribute("href") || "").toLowerCase();
      if (href === current) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      } else {
        link.classList.remove("active");
        link.removeAttribute("aria-current");
      }
    });
  }

  function bindMobileMenu() {
    var toggle = document.getElementById("menu-toggle");
    var sidebar = document.querySelector(".sidebar");
    var overlay = document.getElementById("sidebar-overlay");
    if (!toggle || !sidebar) return;

    function close() {
      sidebar.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      if (overlay) overlay.hidden = true;
    }
    function open() {
      sidebar.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      if (overlay) overlay.hidden = false;
    }
    toggle.addEventListener("click", function () {
      sidebar.classList.contains("is-open") ? close() : open();
    });
    if (overlay) overlay.addEventListener("click", close);
    document.querySelectorAll(".nav a").forEach(function (link) {
      link.addEventListener("click", close);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") close();
    });
  }

  /**
   * Transições suaves entre páginas internas (dashboard ↔ gr ↔ gl ↔ sinistros).
   * Intercepta cliques em links internos, aplica animação de saída e navega.
   * Não afeta links externos, logout nem o fluxo de login.
   */
  function bindPageTransitions() {
    var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    var internalPages = ["dashboard.html", "modulo.html", "sinistros.html", "admin.html", "configuracoes.html", "gr.html", "gl.html"];
    var current = (currentPage() + window.location.search).toLowerCase();

    function isInternal(href) {
      if (!href) return false;
      var clean = href.split("?")[0].split("#")[0].toLowerCase();
      return internalPages.indexOf(clean) !== -1;
    }

    function navigateWithTransition(href) {
      if (document.documentElement.classList.contains("page-leaving")) return;
      document.documentElement.classList.add("page-leaving");
      window.setTimeout(function () {
        window.location.href = href;
      }, 300);
    }

    document.addEventListener("click", function (event) {
      var anchor = event.target.closest("a[href]");
      if (!anchor) return;
      var href = anchor.getAttribute("href");
      if (!isInternal(href)) return;
      var targetPage = href.split("#")[0].toLowerCase();
      if (targetPage === current) {
        event.preventDefault();
        return;
      }
      // permite abrir em nova aba / modifier keys normalmente
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === "_blank") return;
      event.preventDefault();
      navigateWithTransition(href);
    }, true);
  }

  /* Troca de cliente para quem tem acesso a mais de um tenant. */
  function addTenantSwitch(data) {
    if (data.tenants.length < 2 || currentPage() === "admin.html") return;
    var badge = document.querySelector(".client-badge");
    if (!badge || badge.querySelector(".tenant-switch")) return;
    var link = document.createElement("a");
    link.className = "tenant-switch";
    link.href = "index.html?trocar=1";
    link.textContent = "Trocar cliente";
    badge.appendChild(link);
  }

  async function init(options) {
    options = options || {};
    applyExternalBrandAssets();

    if (!window.PortalData) {
      console.error("[Portal] PortalData indisponível — verifique os scripts da página.");
      window.location.replace("index.html");
      return null;
    }

    var ctx;
    try {
      ctx = await window.PortalData.loadContext();
    } catch (error) {
      console.error("[Portal] Falha ao carregar a sessão:", error);
      window.location.replace("index.html");
      return null;
    }
    if (!ctx.session) {
      window.location.replace("index.html");
      return null;
    }
    var isAdmin = Boolean(ctx.profile.is_platform_admin);
    /* A Administração funciona mesmo sem cliente escolhido (ex.: nenhum tenant ainda). */
    if (!ctx.tenant && !(isAdmin && currentPage() === "admin.html")) {
      window.location.replace(isAdmin && !ctx.tenants.length ? "admin.html" : "index.html?trocar=1");
      return null;
    }

    /* A Administração é da plataforma, não de um cliente: não mostra a
       identidade do tenant que estiver selecionado. */
    var naPlataforma = currentPage() === "admin.html" || !ctx.tenant;

    var items = [];
    if (ctx.tenant && currentPage() !== "admin.html") {
      try {
        items = await window.PortalData.loadTenantItems(ctx.tenant.id);
      } catch (error) {
        console.error("[Portal] Falha ao carregar os itens do tenant:", error);
      }
    }

    state = {
      authenticated: true,
      isAdmin: isAdmin,
      profile: ctx.profile,
      name: ctx.profile.nome || ctx.profile.username || ctx.user.email || "Usuário",
      client: naPlataforma ? "Grupo Apisul" : ctx.tenant.nome,
      clientLabel: naPlataforma ? "Administração da plataforma" : "Portal de Gestão & Performance",
      clientLogo: naPlataforma ? LOGO_APISUL : resolveUrl(ctx.tenant.logo_url || ""),
      photo: ctx.profile.foto_url || "",
      perfil: ctx.tenant ? ctx.tenant.papel : (isAdmin ? "admin" : ""),
      podeConfigurar: ctx.tenant ? ctx.tenant.pode_configurar : isAdmin,
      tenant: ctx.tenant,
      tenants: ctx.tenants,
      modulos: ctx.modulos,
      telas: ctx.tenant ? (ctx.tenant.telas || {}) : {},
      itensPortal: items,
      itensProcessos: []
    };

    if (ctx.tenant && currentPage() === "modulo.html") {
      try {
        state.modulo = await window.PortalData.loadModule(ctx.tenant.id, currentModuleSlug(), items);
      } catch (error) {
        console.error("[Portal] Falha ao carregar o módulo:", error);
      }
    }

    buildNav(state);
    if (!applyModuleAccess(state)) return null;

    populateIdentity(state);
    addTenantSwitch(state);
    bindLogout();
    markActiveNav();
    bindMobileMenu();
    bindPageTransitions();

    document.documentElement.classList.add("session-ready");
    if (typeof options.onReady === "function") options.onReady(state);
    document.dispatchEvent(new CustomEvent("portal:ready", { detail: state }));
    return state;
  }

  /* Executa fn assim que os dados da página estiverem prontos. */
  function onReady(fn) {
    if (state && state.authenticated) { fn(state); return; }
    document.addEventListener("portal:ready", function (event) { fn(event.detail); }, { once: true });
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

  window.PortalShell = {
    init: init,
    readSessionData: readSessionData,
    onReady: onReady,
    moduleHref: moduleHref,
    getPortalItems: function () { return readSessionData().itensPortal; },
    getProcessItems: function () { return readSessionData().itensProcessos; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (!document.body.hasAttribute("data-shell-manual")) init();
    }, { once: true });
  } else if (!document.body.hasAttribute("data-shell-manual")) {
    init();
  }
})(window, document);
