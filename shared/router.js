(function () {
  function installBarcodeScannerShortcutGuard() {
    if (window.__coreBarcodeScannerShortcutGuardInstalled) return;

    window.__coreBarcodeScannerShortcutGuardInstalled = true;

    document.addEventListener("keydown", (event) => {
      const currentPage = window.CoreRouterState?.current;
      const target = event.target;
      const isScannerField = target instanceof HTMLElement && target.id === "searchInput";
      const isDownloadsShortcut =
        (event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "j";

      if (currentPage !== "venda" || !isScannerField || !isDownloadsShortcut) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);
  }

  installBarcodeScannerShortcutGuard();

  async function loadText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha ao carregar: ${url} (${res.status})`);
    return await res.text();
  }

    function ensureCss(id, href) {
    return new Promise((resolve, reject) => {
      let el = document.getElementById(id);

      if (!el) {
        el = document.createElement("link");
        el.rel = "stylesheet";
        el.id = id;
        document.head.appendChild(el);
      }

      const done = () => {
        el.removeEventListener("load", done);
        el.removeEventListener("error", fail);
        resolve();
      };

      const fail = () => {
        el.removeEventListener("load", done);
        el.removeEventListener("error", fail);
        reject(new Error(`Falha ao carregar CSS: ${href}`));
      };

      el.addEventListener("load", done, { once: true });
      el.addEventListener("error", fail, { once: true });

      el.href = href;

      if (el.sheet && el.href.includes(href.split("?")[0])) {
        resolve();
      }
    });
  }

  function ensureScript(id, src) {
    return new Promise((resolve, reject) => {
      const old = document.getElementById(id);
      if (old) old.remove();

      const s = document.createElement("script");
      s.id = id;
      s.src = src + `?v=${Date.now()}`;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Falha ao carregar JS: ${src}`));
      document.body.appendChild(s);
    });
  }

  function createRouter({ mountEl }) {
    let current = "home";

    window.CoreRouterState = window.CoreRouterState || {};
    window.CoreRouterState.current = current;

        async function render(pageName) {
      current = pageName;
      window.CoreRouterState.current = current;

      const isLoginPage = pageName === "login" || pageName === "reset-password";
      document.body.classList.toggle("is-login", isLoginPage);

      const base = `pages/${pageName}/${pageName}`;
      const startedAt = performance.now();

      window.CoreLoading?.show();

      try {
        const [html] = await Promise.all([
          loadText(`${base}.html`),
          ensureCss("pageStyles", `${base}.css?v=${Date.now()}`)
        ]);

        mountEl.innerHTML = html;

        await ensureScript("pageScript", `${base}.js`);

        const mods = window.CorePageModules || {};
        if (typeof mods[pageName] === "function") {
          mods[pageName]({ go });
        }

        if (window.CoreUI) {
          window.CoreUI.updateTopbar();
        }

        if (window.CoreAudit) {
          window.CoreAudit.log("PAGE_VIEW", { page: current });
        }
      } finally {
        const elapsed = performance.now() - startedAt;
        const minVisible = 220;

        if (elapsed < minVisible) {
          await new Promise((resolve) => setTimeout(resolve, minVisible - elapsed));
        }

        window.CoreLoading?.hide();
      }
    }

    function go(pageName) {
      render(pageName).catch((err) => {
        console.error(err);
        mountEl.innerHTML = `
          <div class="small-card">
            <div class="small-title"><span class="ico">⚠️</span>Erro</div>
            <div class="hr"></div>
            <pre style="white-space:pre-wrap; margin:0; color:#b91c1c; font-weight:800;">${String(err.message)}</pre>
          </div>
        `;
      });
    }

    return {
      go,
      render,
      getCurrent: () => current
    };
  }

  window.CoreRouter = { createRouter };
})();