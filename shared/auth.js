(function () {
  const SESSION_KEY = "core_session_v3";

  const roleAccess = {
    DEV: ["home", "venda", "produtos", "caixa", "relatorios"],
    ADMIN: ["home", "venda", "produtos", "caixa", "relatorios"],
    ASSOP: ["home", "venda", "produtos", "caixa"],
    OPER: ["home", "venda", "produtos", "caixa"],
    VISU: ["home", "relatorios"]
  };

  function normalizeRole(role) {
    const raw = String(role || "").toUpperCase().trim();

    if (["DEV", "ADMIN", "ASSOP", "OPER", "VISU"].includes(raw)) {
      return raw;
    }

    if (raw === "CORE_ADMIN") return "ADMIN";
    if (raw === "CORE_OPERADOR") return "OPER";
    if (raw === "CORE_VISUALIZADOR") return "VISU";
    if (raw === "FUNC") return "OPER";

    return "OPER";
  }

  function getCachedSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
    } catch {
      return null;
    }
  }

  function setCachedSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearCachedSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function requireSb() {
    if (!window.sb) {
      throw new Error("Supabase client (window.sb) não foi inicializado.");
    }
    return window.sb;
  }

  async function fetchProfileForUser(userId) {
    const sb = requireSb();

    const { data, error } = await sb
      .from("profiles")
      .select(`
        id,
        email,
        full_name,
        avatar_path,
        role,
        status,
        first_access_completed,
        is_protected
      `)
      .eq("id", userId)
      .single();

    if (error) throw error;
    return data || null;
  }

  function buildSessionFromAuthAndProfile(user, profile) {
    if (!user?.id) return null;

    const fixedTenant = window.CatrionTenant?.getFixedTenant?.() || {};
    const tenantId =
      window.CatrionTenant?.getActiveTenantId?.() ||
      fixedTenant.tenantId ||
      null;

    if (!tenantId || tenantId === "PREENCHER_TENANT_ID_AQUI") {
      throw new Error("Tenant fixo ainda não configurado em shared/tenant.js.");
    }

    const role = normalizeRole(profile?.role || "OPER");

    const fullName =
      String(
        profile?.full_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email ||
        "usuário"
      ).trim();

    return {
      userId: user.id,
      id: user.id,
      email: profile?.email || user.email || null,
      fullName,
      name: fullName,
      role,
      status: profile?.status || "active",
      avatarPath: profile?.avatar_path || null,
      firstAccessCompleted: !!profile?.first_access_completed,
      isProtected: !!profile?.is_protected,
      tenantId,
      tenantSlug: fixedTenant.tenantSlug || "bodylife",
      tenantName: fixedTenant.tenantName || "Body Life",
      permissions: [],
      ts: Date.now(),
      source: "core_internal_auth"
    };
  }

  async function bootstrap() {
  await window.CatrionTenant?.ensureActiveTenant?.();

  const sb = requireSb();
  const { data, error } = await sb.auth.getSession();

  if (error) {
    clearCachedSession();
    return { ok: false, message: "Falha ao ler sessão do Supabase.", error };
  }

  const supaSession = data?.session || null;
  const user = supaSession?.user || null;

  if (!user?.id) {
    clearCachedSession();
    return { ok: false, message: "Sem sessão." };
  }

  const cached = getCachedSession();

  // Se o cache for de outro usuário, ignora
  if (cached?.userId && cached.userId !== user.id) {
    clearCachedSession();
  }

  const profile = await fetchProfileForUser(user.id);

  if (!profile) {
    clearCachedSession();
    return { ok: false, message: "Perfil do usuário não encontrado." };
  }

  if (profile.status !== "active") {
    clearCachedSession();
    await sb.auth.signOut();
    return { ok: false, message: "Usuário bloqueado." };
  }

  const session = buildSessionFromAuthAndProfile(user, profile);
  setCachedSession(session);

  return { ok: true, session };
}

  async function login({ email, password }) {
    const sb = requireSb();

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");

    if (!normalizedEmail) {
      return { ok: false, message: "Digite o e-mail." };
    }

    if (!normalizedPassword) {
      return { ok: false, message: "Digite a senha." };
    }

    await window.CatrionTenant?.ensureActiveTenant?.();

    const { data, error } = await sb.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword
    });

    if (error) {
      return { ok: false, message: error.message || "Não foi possível entrar." };
    }

    const user = data?.user || data?.session?.user || null;
    if (!user?.id) {
      return { ok: false, message: "Sessão inválida após login." };
    }

    const profile = await fetchProfileForUser(user.id);

    if (!profile) {
      await sb.auth.signOut();
      return { ok: false, message: "Perfil do usuário não encontrado." };
    }

    if (profile.status !== "active") {
      await sb.auth.signOut();
      return { ok: false, message: "Usuário bloqueado." };
    }

    const session = buildSessionFromAuthAndProfile(user, profile);
    setCachedSession(session);

    return { ok: true, session };
  }

  async function logout() {
    try {
      const sb = requireSb();
      await sb.auth.signOut();
    } catch (err) {
      console.warn("Erro ao sair do Supabase:", err);
    }

    localStorage.removeItem("core_session_v3");
    localStorage.removeItem("core_session_v2");
    window.location.href = window.location.pathname;
  }

  function isLoggedIn() {
    return !!getCachedSession();
  }

  function canAccess(pageName) {
    const s = getCachedSession();
    if (!s) return false;

    const allowed = roleAccess[s.role] || [];
    return allowed.includes(pageName);
  }

  function getCurrentUser() {
    return getCachedSession();
  }

  function getActiveTenantId() {
    return window.CatrionTenant?.getActiveTenantId?.() || null;
  }

  function setActiveTenantId(tenantId) {
    if (!tenantId) {
      window.CatrionTenant?.clearActiveTenantId?.();
      return null;
    }
    return window.CatrionTenant?.setActiveTenantId?.(String(tenantId)) || null;
  }

  function requireTenantId() {
    if (window.CatrionTenant?.requireTenantId) {
      return window.CatrionTenant.requireTenantId();
    }
    const t = getActiveTenantId();
    if (!t) throw new Error("Nenhum tenant ativo definido.");
    return t;
  }

    const rolePermissions = {
  DEV: {
    canManageUsers: true,
    canEditUsers: true,
    canDeleteUsers: true,
    canBlockUsers: true,
    canSendFirstAccess: true,

    canViewReports: true,
    canExportReports: true,

    canCreateProducts: true,
    canEditProducts: true,
    canDeleteProducts: true,
    canMoveStock: true,
    canViewProductCosts: true,

    canOpenCash: true,
    canCloseCash: true,
    canSupplyCash: true,
    canWithdrawCash: true,
    canCancelCashEvent: true,
    canViewCashProfit: true,

    canCompleteSale: true,
    canSaveCoupon: true,
    canDeleteCoupon: true,
    canCreateCustomer: true,
    canDeleteCustomer: true
  },

  ADMIN: {
    canManageUsers: true,
    canEditUsers: true,
    canDeleteUsers: true,
    canBlockUsers: true,
    canSendFirstAccess: true,

    canViewReports: true,
    canExportReports: true,

    canCreateProducts: true,
    canEditProducts: true,
    canDeleteProducts: true,
    canMoveStock: true,
    canViewProductCosts: true,

    canOpenCash: true,
    canCloseCash: true,
    canSupplyCash: true,
    canWithdrawCash: true,
    canCancelCashEvent: true,
    canViewCashProfit: true,

    canCompleteSale: true,
    canSaveCoupon: true,
    canDeleteCoupon: true,
    canCreateCustomer: true,
    canDeleteCustomer: true
  },

  ASSOP: {
    canManageUsers: false,
    canEditUsers: false,
    canDeleteUsers: false,
    canBlockUsers: false,
    canSendFirstAccess: false,

    canViewReports: false,
    canExportReports: false,

    canCreateProducts: true,
    canEditProducts: true,
    canDeleteProducts: true,
    canMoveStock: true,
    canViewProductCosts: true,

    canOpenCash: true,
    canCloseCash: true,
    canSupplyCash: true,
    canWithdrawCash: true,
    canCancelCashEvent: true,
    canViewCashProfit: false,

    canCompleteSale: true,
    canSaveCoupon: true,
    canDeleteCoupon: true,
    canCreateCustomer: true,
    canDeleteCustomer: true
  },

  OPER: {
    canManageUsers: false,
    canEditUsers: false,
    canDeleteUsers: false,
    canBlockUsers: false,
    canSendFirstAccess: false,

    canViewReports: false,
    canExportReports: false,

    canCreateProducts: true,
    canEditProducts: false,
    canDeleteProducts: false,
    canMoveStock: false,
    canViewProductCosts: false,

    canOpenCash: true,
    canCloseCash: true,
    canSupplyCash: false,
    canWithdrawCash: false,
    canCancelCashEvent: false,
    canViewCashProfit: false,

    canCompleteSale: true,
    canSaveCoupon: true,
    canDeleteCoupon: false,
    canCreateCustomer: true,
    canDeleteCustomer: false
  },

  VISU: {
    canManageUsers: false,
    canEditUsers: false,
    canDeleteUsers: false,
    canBlockUsers: false,
    canSendFirstAccess: false,

    canViewReports: true,
    canExportReports: true,

    canCreateProducts: false,
    canEditProducts: false,
    canDeleteProducts: false,
    canMoveStock: false,
    canViewProductCosts: true,

    canOpenCash: false,
    canCloseCash: false,
    canSupplyCash: false,
    canWithdrawCash: false,
    canCancelCashEvent: false,
    canViewCashProfit: true,

    canCompleteSale: false,
    canSaveCoupon: false,
    canDeleteCoupon: false,
    canCreateCustomer: false,
    canDeleteCustomer: false
  }
};

  function getPermissions(role) {
    const normalized = normalizeRole(role);
    return rolePermissions[normalized] || rolePermissions.OPER;
  }

  function can(permissionKey) {
    const s = getCachedSession();
    if (!s) return false;

    const perms = getPermissions(s.role);
    return !!perms[permissionKey];
  }

  window.CoreAuth = {
        getPermissions: () => {
      const s = getCachedSession();
      return getPermissions(s?.role || "OPER");
    },
    can,
    login,
    logout,
    bootstrap,
    isLoggedIn,
    canAccess,
    getCurrentUser,
    getActiveTenantId,
    getCurrentTenantId: getActiveTenantId,
    getTenantId: getActiveTenantId,
    setActiveTenantId,
    requireTenantId,
    normalizeRole
  };
})();
