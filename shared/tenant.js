(function () {
  const KEY = "catrion_active_tenant";
  const SLUG_KEY = "catrion_active_tenant_slug";
  const NAME_KEY = "catrion_active_tenant_name";

  // =========================================================
  // CONFIG FIXA DO CLIENTE
  // =========================================================
  // IMPORTANTE:
  // 1) preencha o tenantId real da Body Life
  // 2) se ainda não souber agora, pode deixar temporariamente
  //    e depois ajustar quando formos validar no banco
  const FIXED_TENANT = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    tenantSlug: "bodylife",
    tenantName: "Body Life"
  };

  function getActiveTenantId() {
    return localStorage.getItem(KEY) || null;
  }

  function getActiveTenantSlug() {
    return localStorage.getItem(SLUG_KEY) || null;
  }

  function getActiveTenantName() {
    return localStorage.getItem(NAME_KEY) || null;
  }

  function setActiveTenantId(id) {
    if (!id) throw new Error("setActiveTenantId: tenant_id inválido.");
    localStorage.setItem(KEY, String(id));
    return String(id);
  }

  function setActiveTenantMeta({ tenantSlug = "", tenantName = "" } = {}) {
    if (tenantSlug) {
      localStorage.setItem(SLUG_KEY, String(tenantSlug));
    }

    if (tenantName) {
      localStorage.setItem(NAME_KEY, String(tenantName));
    }
  }

  function clearActiveTenantId() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SLUG_KEY);
    localStorage.removeItem(NAME_KEY);
  }

  function requireTenantId() {
    const id = getActiveTenantId();
    if (!id) throw new Error("Tenant não definido.");
    return id;
  }

  async function ensureActiveTenant() {
    const existing = getActiveTenantId();
    if (existing) {
      return existing;
    }

    if (!FIXED_TENANT.tenantId) {
      throw new Error("Tenant fixo da Body Life ainda não foi configurado em shared/tenant.js.");
    }

    setActiveTenantId(FIXED_TENANT.tenantId);
    setActiveTenantMeta({
      tenantSlug: FIXED_TENANT.tenantSlug,
      tenantName: FIXED_TENANT.tenantName
    });

    return FIXED_TENANT.tenantId;
  }

  function getFixedTenant() {
    return { ...FIXED_TENANT };
  }

  window.CatrionTenant = {
    getActiveTenantId,
    getActiveTenantSlug,
    getActiveTenantName,
    setActiveTenantId,
    setActiveTenantMeta,
    clearActiveTenantId,
    requireTenantId,
    ensureActiveTenant,
    getFixedTenant
  };
})();
