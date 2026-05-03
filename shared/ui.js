(function () {
  function updateTopbar() {
    const hello = document.getElementById("userHello");
    const btnLogout = document.getElementById("btnLogout");

    if (!hello || !btnLogout) return;

    const session = window.CoreAuth?.getCurrentUser?.() || null;

    if (!session) {
      hello.textContent = "Olá!";
      btnLogout.style.display = "none";
      return;
    }

    const roleLabelMap = {
  DEV: "DEV",
  ADMIN: "ADMIN",
  ASSOP: "ASSOP",
  OPER: "OPER",
  VISU: "VISU"
};

    const nameLabel =
      session.fullName ||
      session.name ||
      session.email ||
      "usuário";

    const roleLabel =
      roleLabelMap[String(session.role || "").toUpperCase()] || "OPER";

    hello.textContent = `Olá, ${nameLabel} (${roleLabel})`;
    btnLogout.style.display = "inline-flex";

    btnLogout.onclick = async () => {
      try {
        window.CoreAudit?.log?.("LOGOUT");
        await window.CoreAuth.logout();
      } catch (err) {
        console.error("Erro ao fazer logout:", err);
      } finally {
        window.location.href = window.location.pathname;
      }
    };

   const reportsBtn = document.getElementById("btnSidebarReports");
const reportsLock = document.getElementById("reportsLock");
const contasBtn = document.getElementById("btnSidebarContas");
const contasLock = document.getElementById("contasLock");
const canViewReports = !!window.CoreAuth?.can?.("canViewReports");

if (reportsBtn) {
  reportsBtn.classList.toggle("is-locked", !canViewReports);
  reportsBtn.disabled = !canViewReports;
  reportsBtn.title = canViewReports ? "" : "Seu perfil não possui acesso a Relatórios.";
}

if (reportsLock) {
  reportsLock.classList.toggle("hidden", canViewReports);
}

if (contasBtn) {
  contasBtn.classList.toggle("is-locked", !canViewReports);
  contasBtn.disabled = !canViewReports;
  contasBtn.title = canViewReports ? "" : "Seu perfil não possui acesso a Contas a Pagar.";
}

if (contasLock) {
  contasLock.classList.toggle("hidden", canViewReports);
}
    
  }

  window.CoreUI = { updateTopbar };
})();