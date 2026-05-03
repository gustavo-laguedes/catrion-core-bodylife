// app.js
const app = document.getElementById("app");
const router = window.CoreRouter.createRouter({ mountEl: app });

const coreLoadingOverlay = document.getElementById("coreLoadingOverlay");

window.CoreLoading = (() => {
  let counter = 0;

  function show() {
  counter += 1;
  coreLoadingOverlay?.classList.remove("is-hidden");
}

  function hide(force = false) {
    if (force) {
      counter = 0;
    } else {
      counter = Math.max(0, counter - 1);
    }

    if (counter === 0) {
      coreLoadingOverlay?.classList.add("is-hidden");
    }
  }

  return { show, hide };
})();

window.coreRouterInstance = router;

const IS_LOCAL_DEV =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

function enableLocalhostWriteGuard() {
  // Guard desativado — localhost com acesso total para testes
}

enableLocalhostWriteGuard();
setTimeout(enableLocalhostWriteGuard, 0);

window.CoreLoading?.show();

(async () => {
  try {
    let isLogged = false;

    if (window.CoreAuth?.bootstrap) {
      const result = await window.CoreAuth.bootstrap();
      isLogged = !!result?.ok && !!window.CoreAuth?.getCurrentUser?.();

      console.log("[CORE] bootstrap result:", result);
      console.log("[CORE] current user after bootstrap:", window.CoreAuth?.getCurrentUser?.());
      console.log("[CORE] active tenant after bootstrap:", window.CoreAuth?.getActiveTenantId?.());
    }

   if (isLogged) {
  const authUser = window.CoreAuth.getCurrentUser();
  const profile = await loadCurrentProfileFromDatabase();

  const resolvedAvatarUrl = await resolveAvatarUrl(profile?.avatar_path || "");

  const mergedUser = {
    ...authUser,
    name: profile?.full_name || authUser?.name || authUser?.email || "Usuário",
    full_name: profile?.full_name || authUser?.full_name || "",
    email: profile?.email || authUser?.email || "",
    role: profile?.role || authUser?.role || "USER",
    avatar_path: profile?.avatar_path || "",
    avatarUrl: resolvedAvatarUrl
  };

  updateUserUI(mergedUser);
    applyGlobalRoleUI();

    setActiveSidebar("home");
  await router.render("home");
} else {
  await router.render("login");
}
    } catch (e) {
    console.warn("CoreAuth.bootstrap falhou:", e);
    await router.render("login");
  } finally {
    window.CoreLoading?.hide(true);
  }
})();

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go-home]");
  if (!el) return;

  setActiveSidebar("home");
  router.go("home");
});


function setActiveSidebar(routeName) {
  document.querySelectorAll(".sidebar-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === routeName);
  });
}

window.setActiveSidebar = setActiveSidebar;

function navigateFromSidebar(route, reportView = "") {
  if (!route) return;

  window.CoreRouterState = window.CoreRouterState || {};
  window.CoreRouterState.reportsInitialView = "";

  router.go(route);
  setActiveSidebar(route);

  if (isMobileViewport()) {
    closeMobileMenu();
  }
}

document.addEventListener("click", (e) => {
  const navBtn = e.target.closest(".sidebar-link[data-route]");
  if (!navBtn) return;

  e.preventDefault();
  e.stopPropagation();

  const route = navBtn.dataset.route;
  const reportView = navBtn.dataset.reportView || "";
  navigateFromSidebar(route, reportView);
});

const coreSidebarEl = document.querySelector(".core-sidebar");

if (coreSidebarEl) {
  coreSidebarEl.addEventListener("touchend", (e) => {
    const navBtn = e.target.closest(".sidebar-link[data-route]");
    if (!navBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const route = navBtn.dataset.route;
    const reportView = navBtn.dataset.reportView || "";
    navigateFromSidebar(route, reportView);
  }, { passive: false });
}

// acessibilidade: Enter/Espaço no “logo”
document.addEventListener("keydown", (e) => {
  const el = document.activeElement;
  if (!el || !el.matches("[data-go-home]")) return;

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    setActiveSidebar("home");
    router.go("home");
  }
});

window.coreRouterInstance = router;
window.setActiveSidebar = setActiveSidebar;


// ===== refs DOM (config global) =====
const adminAuthOverlay = document.getElementById("adminAuthOverlay");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminAuthError = document.getElementById("adminAuthError");

const systemConfigOverlay = document.getElementById("systemConfigOverlay");

const adminUsersOverlay = document.getElementById("adminUsersOverlay");
const btnAdminUsersClose = document.getElementById("btnAdminUsersClose");

const adminUsersList = document.getElementById("adminUsersList");
const adminUsersLoading = document.getElementById("adminUsersLoading");
const adminUsersEmpty = document.getElementById("adminUsersEmpty");
const adminUsersFeedback = document.getElementById("adminUsersFeedback");
const adminUsersSearch = document.getElementById("adminUsersSearch");
const btnAdminNewUser = document.getElementById("btnAdminNewUser");

const adminUserFormOverlay = document.getElementById("adminUserFormOverlay");
const adminUserFormTitle = document.getElementById("adminUserFormTitle");
const adminUserFormSubtitle = document.getElementById("adminUserFormSubtitle");
const btnAdminUserFormClose = document.getElementById("btnAdminUserFormClose");
const btnAdminUserFormCancel = document.getElementById("btnAdminUserFormCancel");
const btnAdminUserFormSave = document.getElementById("btnAdminUserFormSave");
const btnAdminUserSendReset = document.getElementById("btnAdminUserSendReset");
const adminUserFormFeedback = document.getElementById("adminUserFormFeedback");

const adminUserId = document.getElementById("adminUserId");
const adminUserEmail = document.getElementById("adminUserEmail");
const adminUserFullName = document.getElementById("adminUserFullName");

const adminUserRole = document.getElementById("adminUserRole");

const btnSidebarPin = document.getElementById("btnSidebarPin");
const btnMobileMenu = document.getElementById("btnMobileMenu");
const SIDEBAR_PIN_KEY = "core_sidebar_pinned";

loadSidebarPinnedState();

const btnProfileTrigger = document.getElementById("btnProfileTrigger");
const profileOverlay = document.getElementById("profileOverlay");
const btnProfileClose = document.getElementById("btnProfileClose");
const btnProfileCancel = document.getElementById("btnProfileCancel");
const btnProfileSave = document.getElementById("btnProfileSave");

const topbarUserAvatar = document.getElementById("topbarUserAvatar");
const profileAvatarPreview = document.getElementById("profileAvatarPreview");
const profileAvatarInput = document.getElementById("profileAvatarInput");
const btnProfileChooseAvatar = document.getElementById("btnProfileChooseAvatar");
const btnProfileRemoveAvatar = document.getElementById("btnProfileRemoveAvatar");

const profileFullName = document.getElementById("profileFullName");
const profileEmail = document.getElementById("profileEmail");
const profilePassword = document.getElementById("profilePassword");
const profilePasswordConfirm = document.getElementById("profilePasswordConfirm");
const profileFeedback = document.getElementById("profileFeedback");

let profileAvatarFile = null;
let currentProfileAvatarUrl = "";


const configMachines = document.getElementById("machinesSection");

const btnSidebarAccess = document.getElementById("btnSidebarAccess");
const btnSidebarRates = document.getElementById("btnSidebarRates");

// machines
const machineForm = document.getElementById("machineForm");
const btnNewMachine = document.getElementById("btnNewMachine");
const saveMachineBtn = document.getElementById("saveMachine");
const machineNameInput = document.getElementById("machineName");
const machinesList = document.getElementById("machineList");


function getCurrentRole() {
  return window.CoreAuth?.getCurrentUser?.()?.role || "OPER";
}

function can(permissionKey) {
  return !!window.CoreAuth?.can?.(permissionKey);
}

function isAdminUnlocked() {
  return localStorage.getItem("core_admin_authorized") === "true";
}

function canAdminManageUsers() {
  return can("canManageUsers");
}

function canAdminEditUsers() {
  return can("canEditUsers");
}

function canAdminBlockUsers() {
  return can("canBlockUsers");
}

function canAdminDeleteUsers() {
  return can("canDeleteUsers");
}

function canAdminSendFirstAccess() {
  return can("canSendFirstAccess");
}

function isDevOrAdmin() {
  const role = getCurrentRole();
  return role === "DEV" || role === "ADMIN";
}

function applyGlobalRoleUI() {
  const isPrivileged = isDevOrAdmin();

  if (btnSidebarAccess) {
    btnSidebarAccess.style.display = isPrivileged ? "" : "none";
  }

  if (btnSidebarRates) {
    btnSidebarRates.style.display = isPrivileged ? "" : "none";
  }

  if (btnAdminNewUser) {
    btnAdminNewUser.style.display = canAdminManageUsers() ? "" : "none";
  }
}

function applySidebarPinnedState(isPinned) {
  document.body.classList.toggle("sidebar-pinned", !!isPinned);

  if (btnSidebarPin) {
    btnSidebarPin.textContent = isPinned ? "📍" : "📌";
    btnSidebarPin.setAttribute(
      "aria-label",
      isPinned ? "Desafixar menu lateral" : "Fixar menu lateral"
    );
    btnSidebarPin.setAttribute(
      "title",
      isPinned ? "Desafixar menu lateral" : "Fixar menu lateral"
    );
  }
}

function loadSidebarPinnedState() {
  const saved = localStorage.getItem(SIDEBAR_PIN_KEY) === "true";
  applySidebarPinnedState(saved);
}

function toggleSidebarPinnedState(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const next = !document.body.classList.contains("sidebar-pinned");

  document.body.classList.toggle("sidebar-pinned", next);
  localStorage.setItem(SIDEBAR_PIN_KEY, String(next));
  applySidebarPinnedState(next);
}

function isMobileViewport() {
  return window.innerWidth <= 720;
}

function openMobileMenu() {
  document.body.classList.add("mobile-menu-open");
}

function closeMobileMenu() {
  document.body.classList.remove("mobile-menu-open");
}

function toggleMobileMenu(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  document.body.classList.toggle("mobile-menu-open");
}


/* =========================
   CUSTOMERS STORE (Supabase)
========================= */

window.CustomersStore = (function () {
  function requireSb() {
  const candidates = [
    window.sb,
    window.CoreSupabase?.client,
    window.supabase
  ];

  const sb = candidates.find(c => c && typeof c.from === "function") || null;

  if (!sb) {
    throw new Error("Cliente Supabase não encontrado ou inválido em window.");
  }

  return sb;
}

  function getTenantId() {
    const auth = window.CoreAuth;
    if (auth?.getCurrentTenantId) return auth.getCurrentTenantId();
    if (auth?.getTenantId) return auth.getTenantId();

    const u = auth?.getCurrentUser?.() || null;
    return u?.tenant_id || u?.tenantId || null;
  }

  function mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name || "",
      phone: row.phone || "",
      doc: row.doc || "",
      notes: row.notes || "",
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  async function list({ limit = 1000, orderBy = "name", ascending = true } = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    let query = sb
      .from("customers")
      .select("*")
      .eq("tenant_id", tenantId)
      .order(orderBy, { ascending });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
  console.error("[CustomersStore.list] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    tenantId
  });
  throw error;
}

    return (data || []).map(mapRow);
  }

  async function create(payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    const row = {
      tenant_id: tenantId,
      name: String(payload.name || "").trim(),
      phone: String(payload.phone || "").trim() || null,
      doc: String(payload.doc || "").trim() || null,
      notes: String(payload.notes || "").trim() || null
    };

    const { data, error } = await sb
  .from("customers")
  .insert(row)
  .select("*")
  .single();

if (error) {
  console.error("[CustomersStore.create] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    row
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível salvar o cliente.");
}

return mapRow(data);
  }

  async function update(id, payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
    if (!id) throw new Error("ID do cliente é obrigatório.");

    const row = {
      name: String(payload.name || "").trim(),
      phone: String(payload.phone || "").trim() || null,
      doc: String(payload.doc || "").trim() || null,
      notes: String(payload.notes || "").trim() || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
      .from("customers")
      .update(row)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

   if (error) {
  console.error("[CustomersStore.update] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    id,
    tenantId,
    row
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível atualizar o cliente.");
}

return mapRow(data);
  }

  async function remove(id) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
    if (!id) throw new Error("ID do cliente é obrigatório.");

    const { error } = await sb
      .from("customers")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
  console.error("[CustomersStore.remove] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    id,
    tenantId
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível excluir o cliente.");
}
    return true;
  }

  return {
    list,
    create,
    update,
    remove
  };
})();


/* =========================
   MACHINES STORE (Supabase)
========================= */

window.MachinesStore = (function () {
  function requireSb() {
    const candidates = [
      window.sb,
      window.CoreSupabase?.client,
      window.supabase
    ];

    const sb = candidates.find(c => c && typeof c.from === "function") || null;

    if (!sb) {
      throw new Error("Cliente Supabase não encontrado ou inválido em window.");
    }

    return sb;
  }

  function getTenantId() {
    const auth = window.CoreAuth;
    if (auth?.getCurrentTenantId) return auth.getCurrentTenantId();
    if (auth?.getTenantId) return auth.getTenantId();

    const u = auth?.getCurrentUser?.() || null;
    return u?.tenant_id || u?.tenantId || null;
  }

  function normalizeRates(rates) {
  const src = rates && typeof rates === "object" ? rates : {};
  const out = {};

  Object.keys(src).forEach(key => {
    const raw = src[key];

    if (raw && typeof raw === "object") {
      out[String(key)] = {
        enabled: raw.enabled !== false,
        rate: Number(raw.rate || 0)
      };
      return;
    }

    out[String(key)] = {
      enabled: true,
      rate: Number(raw || 0)
    };
  });

  return out;
}

  function mapRow(row) {
    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name || "",
      rates: normalizeRates(row.rates || {}),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      raw: row
    };
  }

  async function list({ limit = 1000, orderBy = "name", ascending = true } = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    let query = sb
      .from("machines")
      .select("*")
      .eq("tenant_id", tenantId)
      .order(orderBy, { ascending });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map(mapRow);
  }

  async function create(payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    const row = {
      tenant_id: tenantId,
      name: String(payload.name || "").trim(),
      rates: normalizeRates(payload.rates || {})
    };

    const { data, error } = await sb
      .from("machines")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async function update(id, payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
    if (!id) throw new Error("ID da maquininha é obrigatório.");

    const row = {
      name: String(payload.name || "").trim(),
      rates: normalizeRates(payload.rates || {}),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
      .from("machines")
      .update(row)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) {
  console.error("[MachinesStore.update] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    id,
    row,
    tenantId
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível atualizar a maquininha.");
}
    return mapRow(data);
  }

  async function remove(id) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
    if (!id) throw new Error("ID da maquininha é obrigatório.");

    const { error } = await sb
      .from("machines")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) throw error;
    return true;
  }

  return {
    list,
    create,
    update,
    remove
  };
})();


/* =========================
   AP CATEGORIES STORE (Supabase)
========================= */

window.APCategoriesStore = (function () {
  function requireSb() {
    const candidates = [
      window.sb,
      window.CoreSupabase?.client,
      window.supabase
    ];
    const sb = candidates.find(c => c && typeof c.from === "function") || null;
    if (!sb) throw new Error("Cliente Supabase não encontrado ou inválido em window.");
    return sb;
  }

  function getTenantId() {
    const auth = window.CoreAuth;
    if (auth?.getCurrentTenantId) return auth.getCurrentTenantId();
    if (auth?.getTenantId) return auth.getTenantId();
    const u = auth?.getCurrentUser?.() || null;
    return u?.tenant_id || u?.tenantId || null;
  }

  function mapRow(row) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: String(row.name || "").trim(),
      createdAt: row.created_at || null
    };
  }

  async function list({ limit = 1000, orderBy = "name", ascending = true } = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    let query = sb
      .from("ap_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order(orderBy, { ascending });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
  console.error("[APCategoriesStore.list] erro Supabase:", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
    tenantId
  });

  const detailedMessage = [
    error.code ? `[${error.code}]` : "",
    error.message || "",
    error.details || "",
    error.hint || ""
  ].filter(Boolean).join(" ");

  throw new Error(detailedMessage || "Não foi possível carregar as categorias.");
}
    return (data || []).map(mapRow);
  }

  async function create(payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    const row = {
      tenant_id: tenantId,
      name: String(payload.name || "").trim()
    };

    const { data, error } = await sb
      .from("ap_categories")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async function remove(id) {
  const sb = requireSb();
  const tenantId = getTenantId();
  if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
  if (!id) throw new Error("ID da categoria é obrigatório.");

  const { error } = await sb
    .from("ap_categories")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[APCategoriesStore.remove] erro Supabase:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      id,
      tenantId
    });

    const detailedMessage = [
      error.code ? `[${error.code}]` : "",
      error.message || "",
      error.details || "",
      error.hint || ""
    ].filter(Boolean).join(" ");

    throw new Error(detailedMessage || "Não foi possível excluir a categoria.");
  }

  return true;
}

  return { list, create, remove };
})();


/* =========================
   AP PAYABLES STORE (Supabase)
========================= */

window.APPayablesStore = (function () {
  function requireSb() {
    const candidates = [
      window.sb,
      window.CoreSupabase?.client,
      window.supabase
    ];
    const sb = candidates.find(c => c && typeof c.from === "function") || null;
    if (!sb) throw new Error("Cliente Supabase não encontrado ou inválido em window.");
    return sb;
  }

  function getTenantId() {
    const auth = window.CoreAuth;
    if (auth?.getCurrentTenantId) return auth.getCurrentTenantId();
    if (auth?.getTenantId) return auth.getTenantId();
    const u = auth?.getCurrentUser?.() || null;
    return u?.tenant_id || u?.tenantId || null;
  }

  function mapRow(row) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      title: row.title || "",
      categoryId: row.category_id || null,
      category: row.category_name || "",
      supplier: row.supplier || "",
      amount: Number(row.amount || 0),
      dueDate: row.due_date || "",
      status: row.status || "pending",
      paidAt: row.paid_at || null,
      paidMethod: row.paid_method || "",
      notes: row.notes || "",
      groupId: row.group_id || "",
      installment: row.installment != null ? Number(row.installment) : null,
      installments: row.installments != null ? Number(row.installments) : null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    };
  }

  async function list({ limit = 5000, orderBy = "due_date", ascending = true } = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    let query = sb
      .from("ap_payables")
      .select("*")
      .eq("tenant_id", tenantId)
      .order(orderBy, { ascending });

    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapRow);
  }

  async function create(payload = {}) {
    const sb = requireSb();
    const tenantId = getTenantId();
    if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");

    const row = {
      tenant_id: tenantId,
      title: String(payload.title || "").trim(),
      category_id: payload.categoryId || null,
      category_name: String(payload.category || "").trim() || null,
      supplier: String(payload.supplier || "").trim() || null,
      amount: Number(payload.amount || 0),
      due_date: payload.dueDate || null,
      status: String(payload.status || "pending"),
      paid_at: payload.paidAt || null,
      paid_method: String(payload.paidMethod || "").trim() || null,
      notes: String(payload.notes || "").trim() || null,
      group_id: String(payload.groupId || "").trim() || null,
      installment: payload.installment != null ? Number(payload.installment) : null,
      installments: payload.installments != null ? Number(payload.installments) : null
    };

    const { data, error } = await sb
      .from("ap_payables")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;
    return mapRow(data);
  }

  async function update(id, payload = {}) {
  const sb = requireSb();
  const tenantId = getTenantId();
  if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
  if (!id) throw new Error("ID da conta é obrigatório.");

  const row = {
    title: String(payload.title || "").trim(),
    category_id: payload.categoryId || null,
    category_name: String(payload.category || "").trim() || null,
    supplier: String(payload.supplier || "").trim() || null,
    amount: Number(payload.amount || 0),
    due_date: payload.dueDate || null,
    status: String(payload.status || "pending"),
    paid_at: payload.paidAt || null,
    paid_method: String(payload.paidMethod || "").trim() || null,
    notes: String(payload.notes || "").trim() || null,
    group_id: String(payload.groupId || "").trim() || null,
    installment: payload.installment != null ? Number(payload.installment) : null,
    installments: payload.installments != null ? Number(payload.installments) : null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb
    .from("ap_payables")
    .update(row)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) throw error;

  return mapRow(data);
}

  async function remove(id) {
  const sb = requireSb();
  const tenantId = getTenantId();
  if (!tenantId) throw new Error("tenant_id não encontrado na sessão.");
  if (!id) throw new Error("ID da conta é obrigatório.");

  const { error } = await sb
    .from("ap_payables")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[APPayablesStore.remove] erro Supabase:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      id,
      tenantId
    });

    const detailedMessage = [
      error.code ? `[${error.code}]` : "",
      error.message || "",
      error.details || "",
      error.hint || ""
    ].filter(Boolean).join(" ");

    throw new Error(detailedMessage || "Não foi possível excluir a conta.");
  }

  return true;
}

  return { list, create, update, remove };
})();


/* =========================
   ADMIN / CONFIGURAÇÕES
========================= */

let pendingAdminTarget = "users";

/* ---------- AUTH ---------- */
function openAdminAuth(target = "users") {
  pendingAdminTarget = target === "system" ? "system" : "users";

  const modalTitle = adminAuthOverlay?.querySelector("h3");
  const modalSubtitle = adminAuthOverlay?.querySelector(".muted");

  if (modalTitle) {
    modalTitle.textContent =
      pendingAdminTarget === "system"
        ? "🔒 Controle de Taxas"
        : "🔒 Gestão de Acessos";
  }

  if (modalSubtitle) {
    modalSubtitle.textContent =
      pendingAdminTarget === "system"
        ? "Digite a senha do administrador para acessar o controle de taxas"
        : "Digite a senha do administrador para acessar a gestão de acessos";
  }

  adminAuthOverlay.classList.remove("core-hidden");
  adminPasswordInput.value = "";
  adminAuthError.textContent = "Senha incorreta.";
  adminAuthError.classList.add("hidden");
  adminPasswordInput.focus();
}

function closeAdminAuth() {
  adminAuthOverlay.classList.add("core-hidden");
}

async function confirmAdminAuth() {
  const password = String(adminPasswordInput?.value || "").trim();

  if (!password) {
    adminAuthError.textContent = "Digite a senha administrativa.";
    adminAuthError.classList.remove("hidden");
    return;
  }

  try {
    adminAuthError.classList.add("hidden");

    if (!window.AdminApi?.verifyAdminPassword) {
      throw new Error("Validador administrativo não carregado.");
    }

    await window.AdminApi.verifyAdminPassword({ password });

    localStorage.setItem("core_admin_authorized", "true");

    applyGlobalRoleUI();
    closeAdminAuth();

    if (pendingAdminTarget === "system") {
      openSystemConfig();
      return;
    }

    openAdminUsers();
  } catch (err) {
    console.error("[ADMIN AUTH] erro ao validar senha:", err);
    adminAuthError.textContent = err?.message || "Senha inválida.";
    adminAuthError.classList.remove("hidden");
  }
}

if (adminPasswordInput) {
  adminPasswordInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await confirmAdminAuth();
    }
  });
}


async function openSystemConfig() {
  systemConfigOverlay.classList.remove("core-hidden");
  switchConfigTab("machines");
  await loadMachines();
  renderMachines();

  if (machineForm) {
    machineForm.classList.add("hidden");
  }

  if (typeof clearMachineForm === "function") {
    clearMachineForm();
  }
}

function closeSystemConfig() {
  systemConfigOverlay.classList.add("core-hidden");
}

async function openAdminUsers() {
  if (!adminUsersOverlay) return;

  adminUsersOverlay.classList.remove("core-hidden");

  if (!canAdminManageUsers()) {
    setAdminUsersFeedback("Você não tem permissão para gerenciar usuários. Visualização somente leitura.");
  } else {
    setAdminUsersFeedback("");
  }

  applyGlobalRoleUI();
  await loadAdminUsers();
}

function closeAdminUsers() {
  if (!adminUsersOverlay) return;
  adminUsersOverlay.classList.add("core-hidden");
}

let adminUsersCache = [];

function setAdminUsersFeedback(message = "", type = "error") {
  if (!adminUsersFeedback) return;

  if (!message) {
    adminUsersFeedback.textContent = "";
    adminUsersFeedback.className = "admin-users-feedback hidden";
    return;
  }

  adminUsersFeedback.textContent = message;
  adminUsersFeedback.className = `admin-users-feedback admin-users-feedback--${type}`;
}

function escapeAdminHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAdminUsersList(list) {
  if (!adminUsersList || !adminUsersEmpty) return;

  adminUsersList.innerHTML = "";

  if (!list.length) {
    adminUsersEmpty.classList.remove("hidden");
    return;
  }

  adminUsersEmpty.classList.add("hidden");

  adminUsersList.innerHTML = list.map((user) => {
    const role = String(user.role || "OPER").toUpperCase();
    const status = String(user.status || "active").toLowerCase();
    const initials = String(user.full_name || user.email || "U")
      .trim()
      .slice(0, 1)
      .toUpperCase();

    return `
      <div class="admin-user-row" data-user-id="${user.id}">
        <div class="admin-user-row__main">
          <div class="admin-user-row__avatar">${initials}</div>

          <div class="admin-user-row__meta">
            <div class="admin-user-row__name">${escapeAdminHtml(user.full_name || "Usuário sem nome")}</div>
            <div class="admin-user-row__email">${escapeAdminHtml(user.email || "")}</div>

            <div class="admin-user-row__badges">
              <span class="admin-role-badge">${role}</span>
              <span class="admin-status-badge ${status === "blocked" ? "admin-status-badge--blocked" : "admin-status-badge--active"}">
                ${status === "blocked" ? "Bloqueado" : "Ativo"}
              </span>
            </div>
          </div>
        </div>

                <div class="admin-user-row__actions">
          ${canAdminEditUsers() ? `
            <button
              class="admin-action-btn admin-action-btn--edit"
              type="button"
              data-action="edit"
              data-user-id="${user.id}"
            >
              Editar
            </button>
          ` : ""}

          ${canAdminBlockUsers() ? `
            <button
              class="admin-action-btn admin-action-btn--warn"
              type="button"
              data-action="toggle-status"
              data-user-id="${user.id}"
            >
              ${status === "blocked" ? "Desbloquear" : "Bloquear"}
            </button>
          ` : ""}

          ${canAdminSendFirstAccess() ? `
            <button
              class="admin-action-btn"
              type="button"
              data-action="first-access"
              data-user-id="${user.id}"
            >
              Primeiro acesso
            </button>
          ` : ""}

          ${canAdminDeleteUsers() ? `
            <button
              class="admin-action-btn admin-action-btn--danger"
              type="button"
              data-action="delete"
              data-user-id="${user.id}"
            >
              Excluir
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");
}



async function loadAdminUsers() {
  if (!window.AdminApi?.listUsers) {
    setAdminUsersFeedback("AdminApi não carregada.");
    return;
  }

  try {
    setAdminUsersFeedback("");
    if (adminUsersLoading) adminUsersLoading.classList.remove("hidden");
    if (adminUsersEmpty) adminUsersEmpty.classList.add("hidden");
    if (adminUsersList) adminUsersList.innerHTML = "";

    const result = await window.AdminApi.listUsers();
    adminUsersCache = Array.isArray(result?.users) ? result.users : [];

    renderAdminUsersList(adminUsersCache);
  } catch (err) {
    console.error("[ADMIN USERS] erro ao carregar usuários:", err);
    setAdminUsersFeedback(err?.message || "Não foi possível carregar os usuários.");
  } finally {
    if (adminUsersLoading) adminUsersLoading.classList.add("hidden");
  }
}

function setAdminUserFormFeedback(message = "", type = "error") {
  if (!adminUserFormFeedback) return;

  if (!message) {
    adminUserFormFeedback.textContent = "";
    adminUserFormFeedback.className = "hidden";
    return;
  }

  adminUserFormFeedback.textContent = message;
  adminUserFormFeedback.className = `admin-users-feedback admin-users-feedback--${type}`;
}

function clearAdminUserForm() {
  if (adminUserId) adminUserId.value = "";
  if (adminUserEmail) adminUserEmail.value = "";
  if (adminUserFullName) adminUserFullName.value = "";
  if (adminUserRole) adminUserRole.value = "OPER";

  setAdminUserFormFeedback("");

  if (btnAdminUserSendReset) {
    btnAdminUserSendReset.style.display = "none";
  }
}

function getAdminUserById(userId) {
  return adminUsersCache.find((user) => String(user.id) === String(userId)) || null;
}

function openAdminUserEditForm(userId) {
  const user = getAdminUserById(userId);
  if (!user) {
    setAdminUsersFeedback("Usuário não encontrado.");
    return;
  }

  clearAdminUserForm();

  if (adminUserId) adminUserId.value = user.id || "";
  if (adminUserEmail) adminUserEmail.value = user.email || "";
  if (adminUserFullName) adminUserFullName.value = user.full_name || "";
  if (adminUserRole) adminUserRole.value = String(user.role || "OPER").toUpperCase();

  if (adminUserFormTitle) adminUserFormTitle.textContent = "Editar usuário";
  if (adminUserFormSubtitle) adminUserFormSubtitle.textContent = "Atualize os dados e permissões do usuário";

  if (adminUserEmail) adminUserEmail.disabled = false;

  if (btnAdminUserSendReset) {
    btnAdminUserSendReset.style.display = "inline-flex";
  }

  if (adminUserFormOverlay) {
    adminUserFormOverlay.classList.remove("core-hidden");
  }
}

function isEditingAdminUser() {
  return !!String(adminUserId?.value || "").trim();
}

function openAdminUserCreateForm() {
  clearAdminUserForm();

  if (adminUserFormTitle) adminUserFormTitle.textContent = "Novo usuário";
  if (adminUserFormSubtitle) adminUserFormSubtitle.textContent = "Criar usuário e enviar primeiro acesso";

  if (adminUserEmail) adminUserEmail.disabled = false;

  if (adminUserFormOverlay) {
    adminUserFormOverlay.classList.remove("core-hidden");
  }
}

function closeAdminUserForm() {
  if (!adminUserFormOverlay) return;
  adminUserFormOverlay.classList.add("core-hidden");
}

async function saveAdminUser() {
  const isEditing = isEditingAdminUser();

  if (!window.AdminApi?.createUser || !window.AdminApi?.updateUser) {
    setAdminUserFormFeedback("AdminApi não carregada.");
    return;
  }

  const userId = String(adminUserId?.value || "").trim();
  const email = String(adminUserEmail?.value || "").trim().toLowerCase();
  const fullName = String(adminUserFullName?.value || "").trim();
  const role = String(adminUserRole?.value || "").trim().toUpperCase();

  if (!email) {
    setAdminUserFormFeedback("Digite o e-mail do usuário.");
    return;
  }

  if (!role) {
    setAdminUserFormFeedback("Selecione o papel do usuário.");
    return;
  }

  try {
    setAdminUserFormFeedback("");

    if (btnAdminUserFormSave) {
      btnAdminUserFormSave.disabled = true;
      btnAdminUserFormSave.textContent = isEditing ? "Salvando alterações..." : "Salvando...";
    }

    if (isEditing) {
      await window.AdminApi.updateUser({
        user_id: userId,
        full_name: fullName || null,
        email,
        role
      });

      closeAdminUserForm();
      await loadAdminUsers();
      setAdminUsersFeedback("Usuário atualizado com sucesso.", "success");
      return;
    }

    await window.AdminApi.createUser({ email, role });

    closeAdminUserForm();
    await loadAdminUsers();

    setAdminUsersFeedback("Usuário criado e e-mail de primeiro acesso enviado.", "success");
  } catch (err) {
    console.error("[ADMIN USERS] erro ao salvar usuário:", err);
    setAdminUserFormFeedback(err?.message || "Não foi possível salvar o usuário.");
  } finally {
    if (btnAdminUserFormSave) {
      btnAdminUserFormSave.disabled = false;
      btnAdminUserFormSave.textContent = "Salvar";
    }
  }
}


async function sendAdminFirstAccess(userId) {
  if (!window.AdminApi?.sendFirstAccess) {
    setAdminUsersFeedback("AdminApi não carregada.");
    return;
  }

  const actionBtn = adminUsersList?.querySelector(
    `[data-action="first-access"][data-user-id="${userId}"]`
  );

  try {
    setAdminUsersFeedback("");

    if (actionBtn) {
      actionBtn.disabled = true;
      actionBtn.textContent = "Gerando link...";
    }

    const result = await window.AdminApi.sendFirstAccess({ user_id: userId });
    const actionLink = result?.action_link || "";

    if (!actionLink) {
      throw new Error("O link de primeiro acesso não foi retornado.");
    }

    await navigator.clipboard.writeText(actionLink);

    setAdminUsersFeedback("Link de primeiro acesso copiado com sucesso. Agora é só enviar ao usuário.", "success");
  } catch (err) {
    console.error("[ADMIN USERS] erro ao gerar primeiro acesso:", err);
    setAdminUsersFeedback(err?.message || "Não foi possível gerar o primeiro acesso.");
  } finally {
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.textContent = "Primeiro acesso";
    }
  }
}

async function toggleAdminUserStatus(userId) {
  if (!window.AdminApi?.toggleUserStatus) {
    setAdminUsersFeedback("AdminApi não carregada.");
    return;
  }

  const user = getAdminUserById(userId);
  if (!user) {
    setAdminUsersFeedback("Usuário não encontrado.");
    return;
  }

  const currentStatus = String(user.status || "active").toLowerCase();
  const nextStatus = currentStatus === "blocked" ? "active" : "blocked";

  const confirmMessage =
    nextStatus === "blocked"
      ? "Deseja bloquear este usuário?"
      : "Deseja desbloquear este usuário?";

  const confirmed = window.confirm(confirmMessage);
  if (!confirmed) return;

  const actionBtn = adminUsersList?.querySelector(
    `[data-action="toggle-status"][data-user-id="${userId}"]`
  );

  try {
    setAdminUsersFeedback("");

    if (actionBtn) {
      actionBtn.disabled = true;
      actionBtn.textContent = nextStatus === "blocked" ? "Bloqueando..." : "Desbloqueando...";
    }

    await window.AdminApi.toggleUserStatus({
      user_id: userId,
      status: nextStatus
    });

    await loadAdminUsers();

    setAdminUsersFeedback(
      nextStatus === "blocked"
        ? "Usuário bloqueado com sucesso."
        : "Usuário desbloqueado com sucesso.",
      "success"
    );
  } catch (err) {
    console.error("[ADMIN USERS] erro ao alterar status:", err);
    setAdminUsersFeedback(err?.message || "Não foi possível alterar o status do usuário.");
  } finally {
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.textContent = nextStatus === "blocked" ? "Bloquear" : "Desbloquear";
    }
  }
}

async function deleteAdminUser(userId) {
  if (!window.AdminApi?.deleteUser) {
    setAdminUsersFeedback("AdminApi não carregada.");
    return;
  }

  const user = getAdminUserById(userId);
  if (!user) {
    setAdminUsersFeedback("Usuário não encontrado.");
    return;
  }

  const label = user.full_name || user.email || "este usuário";
  const confirmed = window.confirm(`Deseja excluir ${label}? Essa ação não pode ser desfeita.`);
  if (!confirmed) return;

  const actionBtn = adminUsersList?.querySelector(
    `[data-action="delete"][data-user-id="${userId}"]`
  );

  try {
    setAdminUsersFeedback("");

    if (actionBtn) {
      actionBtn.disabled = true;
      actionBtn.textContent = "Excluindo...";
    }

    await window.AdminApi.deleteUser({ user_id: userId });

    await loadAdminUsers();

    setAdminUsersFeedback("Usuário excluído com sucesso.", "success");
  } catch (err) {
    console.error("[ADMIN USERS] erro ao excluir usuário:", err);
    setAdminUsersFeedback(err?.message || "Não foi possível excluir o usuário.");
  } finally {
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.textContent = "Excluir";
    }
  }
}

if (btnAdminUsersClose) {
  btnAdminUsersClose.addEventListener("click", closeAdminUsers);
}

if (adminUsersOverlay) {
  adminUsersOverlay.addEventListener("click", (e) => {
    if (e.target === adminUsersOverlay) {
      closeAdminUsers();
    }
  });
}

if (adminUsersSearch) {
  adminUsersSearch.addEventListener("input", () => {
    const q = String(adminUsersSearch.value || "").trim().toLowerCase();

    const filtered = adminUsersCache.filter((user) => {
      const name = String(user.full_name || "").toLowerCase();
      const email = String(user.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });

    renderAdminUsersList(filtered);
  });
}

if (btnAdminNewUser) {
  btnAdminNewUser.addEventListener("click", openAdminUserCreateForm);
}

if (btnSidebarPin) {
  btnSidebarPin.addEventListener("click", (e) => {
    toggleSidebarPinnedState(e);
  });
}

if (btnMobileMenu) {
  btnMobileMenu.addEventListener("click", (e) => {
    toggleMobileMenu(e);
  });
}

if (btnAdminUserFormClose) {
  btnAdminUserFormClose.addEventListener("click", closeAdminUserForm);
}

if (btnAdminUserFormCancel) {
  btnAdminUserFormCancel.addEventListener("click", closeAdminUserForm);
}

if (adminUserFormOverlay) {
  adminUserFormOverlay.addEventListener("click", (e) => {
    if (e.target === adminUserFormOverlay) {
      closeAdminUserForm();
    }
  });
}

if (btnAdminUserFormSave) {
  btnAdminUserFormSave.addEventListener("click", saveAdminUser);
}

if (adminUsersList) {
  adminUsersList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const userId = btn.dataset.userId;

    if (!action || !userId) return;

    if (action === "edit") {
      openAdminUserEditForm(userId);
      return;
    }

    if (action === "toggle-status") {
      await toggleAdminUserStatus(userId);
      return;
    }

    if (action === "first-access") {
      await sendAdminFirstAccess(userId);
      return;
    }

    if (action === "delete") {
      await deleteAdminUser(userId);
    }
  });
}

/* ---------- TABS ---------- */
function switchConfigTab(tab) {
  if (configMachines) {
    configMachines.classList.toggle("hidden", tab !== "machines");
  }

  document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
  const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
  if (btn) btn.classList.add("active");

  if (machineForm) {
    machineForm.classList.add("hidden");
  }

  if (typeof clearMachineForm === "function") {
    clearMachineForm();
  }

  editingMachineId = null;

  if (saveMachineBtn) {
    saveMachineBtn.textContent = "Salvar";
  }
}

/* =========================
   MAQUININHAS
========================= */

let editingMachineId = null;
let machinesCache = [];

function getRateInput(key){
  return document.querySelector(`[data-rate="${key}"]`);
}

function getRateCheckbox(key){
  return document.querySelector(`[data-rate-enabled="${key}"]`);
}

function setRateEnabled(key, enabled){
  const input = getRateInput(key);
  const checkbox = getRateCheckbox(key);

  const isEnabled = !!enabled;

  if (checkbox) checkbox.checked = isEnabled;

  if (input){
    input.disabled = !isEnabled;
    input.classList.toggle("is-disabled-rate", !isEnabled);

    if (!isEnabled){
      input.value = "";
    }
  }
}

function bindRateToggles(){
  document.querySelectorAll("[data-rate-enabled]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const key = checkbox.dataset.rateEnabled;
      const input = getRateInput(key);
      const enabled = checkbox.checked;

      if (input){
        input.disabled = !enabled;
        input.classList.toggle("is-disabled-rate", !enabled);

        if (!enabled){
          input.value = "";
        }
      }
    });
  });
}


function clearMachineForm(){
  machineNameInput.value = "";

  document.querySelectorAll("[data-rate]").forEach(inp => {
    inp.value = "";
    inp.disabled = false;
    inp.classList.remove("is-disabled-rate");
  });

  document.querySelectorAll("[data-rate-enabled]").forEach(chk => {
    chk.checked = true;
  });

  editingMachineId = null;
  if (saveMachineBtn) saveMachineBtn.textContent = "Salvar";
}

function showMachineForm() {
  if (!machineForm) return;

  const isHidden = machineForm.classList.contains("hidden");

  if (isHidden) {
    clearMachineForm();
    machineForm.classList.remove("hidden");
    machineNameInput?.focus();
    return;
  }

  machineForm.classList.add("hidden");
  clearMachineForm();
}

async function loadMachines(){
  try{
    if (!window.MachinesStore?.list){
      console.warn("[APP] MachinesStore não encontrado.");
      machinesCache = [];
      return machinesCache;
    }

    machinesCache = await window.MachinesStore.list({
      limit: 1000,
      orderBy: "name",
      ascending: true
    });

    return machinesCache;
  }catch(err){
    console.error("[APP] Erro ao carregar maquininhas:", err);
    machinesCache = [];
    return machinesCache;
  }
}

async function startEditMachine(id){
  if (!id) return;

  const m = machinesCache.find(x => String(x.id) === String(id));
  if (!m) return;

  editingMachineId = m.id;
  machineForm.classList.remove("hidden");
  machineNameInput.value = m.name || "";

  document.querySelectorAll("[data-rate]").forEach(inp => {
  const key = inp.dataset.rate;
  const cfg = m.rates?.[key] || { enabled: true, rate: 0 };

  inp.value = cfg.enabled ? Number(cfg.rate || 0) : "";
  inp.disabled = !cfg.enabled;
  inp.classList.toggle("is-disabled-rate", !cfg.enabled);

  const checkbox = getRateCheckbox(key);
  if (checkbox) checkbox.checked = !!cfg.enabled;
});

  saveMachineBtn.textContent = "Salvar alterações";
}

async function saveMachine(){
  const name = machineNameInput.value.trim();
  if (!name) return;

  const rates = {};

document.querySelectorAll("[data-rate]").forEach(inp => {
  const key = inp.dataset.rate;
  const checkbox = getRateCheckbox(key);
  const enabled = checkbox ? checkbox.checked : true;

  rates[key] = {
    enabled,
    rate: enabled ? Number(inp.value || 0) : 0
  };
});

  try{
    if (editingMachineId === null){
      await window.MachinesStore.create({ name, rates });
    } else {
      await window.MachinesStore.update(editingMachineId, { name, rates });
    }

    await loadMachines();
    renderMachines();

    clearMachineForm();
    machineForm.classList.add("hidden");
  }catch(err){
    console.error("[APP] Erro ao salvar maquininha:", err);
    alert("Não foi possível salvar a maquininha.");
  }
}

function renderMachines(){
  machinesList.innerHTML = "";

  machinesCache.forEach((m) => {
    machinesList.innerHTML += `
      <div class="list-item">
        <div>
          <div style="font-weight:950; color:#0f172a;">${m.name}</div>
          <div class="meta">
  Débito: <b>${m.rates?.debito?.enabled ? `${Number(m.rates?.debito?.rate || 0)}%` : "desabilitado"}</b> •
  Crédito 1x: <b>${m.rates?.["1"]?.enabled ? `${Number(m.rates?.["1"]?.rate || 0)}%` : "desabilitado"}</b> •
  Crédito 2x: <b>${m.rates?.["2"]?.enabled ? `${Number(m.rates?.["2"]?.rate || 0)}%` : "desabilitado"}</b>
</div>
        </div>
        <div class="actions">
          <button class="icon-action edit" title="Editar" onclick="startEditMachine('${m.id}')">✏️</button>
          <button class="icon-action del" title="Excluir" onclick="removeMachine('${m.id}')">✖</button>
        </div>
      </div>
    `;
  });
}

async function removeMachine(id){
  if (!id) return;

  const ok = confirm("Deseja realmente excluir esta maquininha?");
  if (!ok) return;

  try{
    await window.MachinesStore.remove(id);

    await loadMachines();
    renderMachines();

    if (editingMachineId === id){
      clearMachineForm();
      machineForm.classList.add("hidden");
    }
  }catch(err){
    console.error("[APP] Erro ao excluir maquininha:", err);
    alert("Não foi possível excluir a maquininha.");
  }
}

if (btnNewMachine){
  btnNewMachine.addEventListener("click", showMachineForm);
}

if (saveMachineBtn){
  saveMachineBtn.addEventListener("click", async () => {
    await saveMachine();
  });
}

bindRateToggles();

/* =========================
   CHAT GLOBAL (LocalStorage)
   1 sala / todos
========================= */

const CHAT_KEY = "core.chat.v1";
const CHAT_READ_KEY = "core.chat.readAt.v1"; // por usuário

const btnChat = document.getElementById("btnChat");
const chatUnreadBadge = document.getElementById("chatUnreadBadge");

const chatOverlay = document.getElementById("chatOverlay");
const btnChatClose = document.getElementById("btnChatClose");
const btnChatClear = document.getElementById("btnChatClear");
// Modal limpar chat (senha admin)
const chatClearOverlay = document.getElementById("chatClearOverlay");
const btnChatClearClose = document.getElementById("btnChatClearClose");
const btnChatClearCancel = document.getElementById("btnChatClearCancel");
const btnChatClearConfirm = document.getElementById("btnChatClearConfirm");
const chatClearPass = document.getElementById("chatClearPass");
const chatClearError = document.getElementById("chatClearError");

const chatList = document.getElementById("chatList");
const chatInput = document.getElementById("chatInput");
const btnChatSend = document.getElementById("btnChatSend");

function chatNowISO(){ return new Date().toISOString(); }
function chatFmtTime(iso){
  try { return new Date(iso).toLocaleString("pt-BR"); }
  catch { return ""; }
}

function chatLoad(){
  try{
    const raw = localStorage.getItem(CHAT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    return [];
  }
}

function chatSave(list){
  localStorage.setItem(CHAT_KEY, JSON.stringify(list || []));
}

function chatGetSessionUser(){
  // tenta pegar de CoreAuth; fallback pro texto da topbar
  const s = window.CoreAuth?.getCurrentUser?.();
  if (s && (s.name || s.user || s.username)){
    return {
      id: String(s.id || s.user || s.username || s.name),
      name: String(s.name || s.user || s.username),
      role: String(s.role || "FUNC")
    };
  }

  const hello = document.getElementById("userHello")?.textContent || "Usuário";
  const cleaned = String(hello)
    .replace(/^Olá[,!]?\s*/i, "")
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim();

  return { id: cleaned || "user", name: cleaned || "Usuário", role: "FUNC" };
}

function chatLoadUsers(){
  try{
    const raw = localStorage.getItem("core_users");
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}

function isAdminSession(){
  const s = window.CoreAuth?.getCurrentUser?.();
  const role = String(s?.role || "").toUpperCase();
  return role === "ADMIN" || role === "DEV";
}

async function validateAdminPassword(pass) {
  if (!window.AdminApi?.verifyAdminPassword) {
    throw new Error("Validador administrativo não carregado.");
  }

  const result = await window.AdminApi.verifyAdminPassword({
    password: String(pass || "").trim()
  });

  return !!result?.ok;
}

function chatClearAll(){
  localStorage.removeItem(CHAT_KEY);
  localStorage.removeItem(CHAT_READ_KEY);
  chatRender();
  chatRefreshBadge();
}

btnChatClear?.addEventListener("click", () => {
  // só ADMIN/DEV pode nem abrir o modal
  if (!isAdminSession()){
    alert("Apenas ADMIN pode limpar o chat.");
    return;
  }
  openChatClearModal();
});

btnChatClearClose?.addEventListener("click", closeChatClearModal);
btnChatClearCancel?.addEventListener("click", closeChatClearModal);

chatClearOverlay?.addEventListener("click", (e) => {
  if (e.target === chatClearOverlay) closeChatClearModal();
});

btnChatClearConfirm?.addEventListener("click", async () => {
  const pass = String(chatClearPass?.value || "").trim();

  if (!pass) {
    chatClearError.textContent = "Digite a senha do ADMIN.";
    chatClearError.classList.remove("hidden");
    chatClearPass?.focus();
    return;
  }

  try {
    await validateAdminPassword(pass);

    chatClearError.classList.add("hidden");
    chatClearAll();
    closeChatClearModal();
  } catch (err) {
    chatClearError.textContent = err?.message || "Senha inválida.";
    chatClearError.classList.remove("hidden");
    chatClearPass?.select();
    chatClearPass?.focus();
  }
});

chatClearPass?.addEventListener("keydown", (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    btnChatClearConfirm?.click();
  }
  if (e.key === "Escape"){
    e.preventDefault();
    closeChatClearModal();
  }
});


function chatLoadReadMap(){
  try{
    const raw = localStorage.getItem(CHAT_READ_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  }catch{
    return {};
  }
}

function chatSaveReadMap(obj){
  localStorage.setItem(CHAT_READ_KEY, JSON.stringify(obj || {}));
}

function chatGetReadAt(userId){
  const map = chatLoadReadMap();
  return map[userId] ? Number(map[userId]) : 0;
}

function chatMarkRead(){
  const u = chatGetSessionUser();
  const map = chatLoadReadMap();
  map[u.id] = Date.now();
  chatSaveReadMap(map);
  chatRefreshBadge();
}

function chatHasUnread(){
  const u = chatGetSessionUser();
  const msgs = chatLoad();
  if (!msgs.length) return false;

  const lastTs = msgs[msgs.length - 1]?.ts || 0;
  const readAt = chatGetReadAt(u.id);
  return Number(lastTs) > Number(readAt);
}

function chatRefreshBadge(){
  if (!chatUnreadBadge) return;
  const has = chatHasUnread();
  chatUnreadBadge.classList.toggle("hidden", !has);
}

function chatRender(){
  if (!chatList) return;

  const msgs = chatLoad();
  if (!msgs.length){
    chatList.innerHTML = `<div class="muted" style="padding:10px;font-weight:900;">Sem mensagens ainda.</div>`;
    return;
  }

  chatList.innerHTML = msgs.map(m => {
    const initial = String(m.byName || "?").trim().slice(0,1).toUpperCase();
    const role = m.byRole ? ` (${m.byRole})` : "";
    return `
      <div class="chat-msg">
        <div class="chat-avatar">${initial}</div>
        <div class="chat-bubble">
          <div class="chat-meta">
            <span>${m.byName || "—"}${role}</span>
            <span class="time">${chatFmtTime(m.at)}</span>
          </div>
          <div class="chat-text">${escapeHtml(String(m.text || ""))}</div>
        </div>
      </div>
    `;
  }).join("");

  // scroll pro fim
  chatList.scrollTop = chatList.scrollHeight;
}

function escapeHtml(str){
  return str
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function chatOpen(){
  if (!chatOverlay) return;
  chatOverlay.classList.remove("core-hidden");
  chatRender();
  chatMarkRead();
  setTimeout(() => chatInput?.focus(), 30);
}

function chatClose(){
  if (!chatOverlay) return;
  chatOverlay.classList.add("core-hidden");
}

function openChatClearModal(){
  if (!chatClearOverlay) return;

  chatClearError?.classList.add("hidden");
  if (chatClearPass) chatClearPass.value = "";

  chatClearOverlay.classList.remove("core-hidden");
  setTimeout(() => chatClearPass?.focus(), 30);
}

function closeChatClearModal(){
  if (!chatClearOverlay) return;
  chatClearOverlay.classList.add("core-hidden");
}


function chatSend(){
  const text = String(chatInput?.value || "").trim();
  if (!text) return;

  const u = chatGetSessionUser();
  const msgs = chatLoad();

  msgs.push({
    id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
    at: chatNowISO(),
    ts: Date.now(),
    byId: u.id,
    byName: u.name,
    byRole: u.role,
    text
  });

  // limite simples pra não explodir localStorage
  const MAX = 300;
  const next = msgs.length > MAX ? msgs.slice(msgs.length - MAX) : msgs;

  chatSave(next);
  chatInput.value = "";
  chatRender();
  chatMarkRead();
}

// listeners
btnChat?.addEventListener("click", (e) => { e.preventDefault(); chatOpen(); });
btnChatClose?.addEventListener("click", chatClose);
chatOverlay?.addEventListener("click", (e) => { if (e.target === chatOverlay) chatClose(); });

btnChatSend?.addEventListener("click", chatSend);
chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter"){
    e.preventDefault();
    chatSend();
  }
  if (e.key === "Escape"){
    e.preventDefault();
    chatClose();
  }
});

// atualiza badge quando storage muda (outra aba/janela)
window.addEventListener("storage", (e) => {
  if (e.key === CHAT_KEY || e.key === CHAT_READ_KEY){
    chatRefreshBadge();
    // se o chat estiver aberto, re-renderiza
    if (chatOverlay && !chatOverlay.classList.contains("core-hidden")){
      chatRender();
      chatMarkRead();
    }
  }
});

// init
chatRefreshBadge();

// expõe API global (se quiser mandar msg do DEV/rotas etc)
window.CoreChat = {
  open: chatOpen,
  close: chatClose,
  send: (text) => {
    if (!text) return;
    if (!chatInput) return;
    chatInput.value = String(text);
    chatSend();
  },
  refreshBadge: chatRefreshBadge
};

function setProfileFeedback(message = "", type = "error") {
  if (!profileFeedback) return;

  if (!message) {
    profileFeedback.textContent = "";
    profileFeedback.className = "admin-users-feedback hidden";
    return;
  }

  profileFeedback.textContent = message;
  profileFeedback.className = `admin-users-feedback admin-users-feedback--${type}`;
}

function getUserInitial(nameOrEmail = "") {
  return String(nameOrEmail || "U").trim().charAt(0).toUpperCase() || "U";
}

function resolveAvatarUrl(avatarPath) {
  if (!avatarPath) return "";

  // Se já é uma URL completa (http/https), usa direto
  if (avatarPath.startsWith("http")) return avatarPath;

  const { data } = window.sb.storage
    .from("user-avatars")
    .getPublicUrl(avatarPath);

  return data?.publicUrl || "";
}

function renderAvatarTarget(el, { name = "", avatarUrl = "" } = {}) {
  if (!el) return;

  if (avatarUrl) {
    el.innerHTML = `<img src="${avatarUrl}" alt="Avatar">`;
    return;
  }

  el.textContent = getUserInitial(name);
}

function openProfileModal() {
  if (!profileOverlay) return;

  const user = window.CoreAuth?.getCurrentUser?.();
  if (!user) return;

  profileAvatarFile = null;

  const rawPath = user.avatarUrl || user.avatar_path || "";
  currentProfileAvatarUrl = window._coreResolvedAvatarUrl || resolveAvatarUrl(rawPath);

  if (profileFullName) {
    profileFullName.value = user.name || user.full_name || "";
  }

  if (profileEmail) {
    profileEmail.value = user.email || "";
  }

  if (profilePassword) profilePassword.value = "";
  if (profilePasswordConfirm) profilePasswordConfirm.value = "";

  renderAvatarTarget(profileAvatarPreview, {
    name: user.name || user.email || "Usuário",
    avatarUrl: currentProfileAvatarUrl
  });

  setProfileFeedback("");
  profileOverlay.classList.remove("core-hidden");
}

function closeProfileModal() {
  if (!profileOverlay) return;
  profileOverlay.classList.add("core-hidden");
}

function isAuthChangeRequired({ oldEmail, newEmail, password }) {
  return String(oldEmail || "").trim().toLowerCase() !== String(newEmail || "").trim().toLowerCase()
    || !!String(password || "").trim();
}

if (btnProfileTrigger) {
  btnProfileTrigger.addEventListener("click", openProfileModal);
}

if (btnProfileClose) {
  btnProfileClose.addEventListener("click", closeProfileModal);
}

if (btnProfileCancel) {
  btnProfileCancel.addEventListener("click", closeProfileModal);
}

if (btnProfileSave) {
  btnProfileSave.addEventListener("click", saveProfile);
}

if (profileOverlay) {
  profileOverlay.addEventListener("click", (e) => {
    if (e.target === profileOverlay) {
      closeProfileModal();
    }
  });
}

if (btnProfileChooseAvatar && profileAvatarInput) {
  btnProfileChooseAvatar.addEventListener("click", () => {
    profileAvatarInput.click();
  });
}

if (profileAvatarInput) {
  profileAvatarInput.addEventListener("change", () => {
    const file = profileAvatarInput.files?.[0] || null;
    profileAvatarFile = file;

    if (!file) return;

    const localUrl = URL.createObjectURL(file);
    renderAvatarTarget(profileAvatarPreview, {
      name: profileFullName?.value || profileEmail?.value || "Usuário",
      avatarUrl: localUrl
    });
  });
}

if (btnProfileRemoveAvatar) {
  btnProfileRemoveAvatar.addEventListener("click", () => {
    profileAvatarFile = null;
    currentProfileAvatarUrl = "";

    if (profileAvatarInput) {
      profileAvatarInput.value = "";
    }

    renderAvatarTarget(profileAvatarPreview, {
      name: profileFullName?.value || profileEmail?.value || "Usuário",
      avatarUrl: ""
    });
  });
}

document.addEventListener("click", (e) => {
  if (!isMobileViewport()) return;
  if (!document.body.classList.contains("mobile-menu-open")) return;

  const clickedSidebar = e.target.closest(".core-sidebar");
  const clickedMenuBtn = e.target.closest("#btnMobileMenu");
  const clickedRouteBtn = e.target.closest(".sidebar-link[data-route]");

  if (clickedRouteBtn) return;

  if (!clickedSidebar && !clickedMenuBtn) {
    closeMobileMenu();
  }
});

window.addEventListener("resize", () => {
  if (!isMobileViewport()) {
    closeMobileMenu();
  }
});

async function uploadProfileAvatar(file, userId) {
  if (!file || !userId) return null;

  const ext = String(file.name.split(".").pop() || "jpg").toLowerCase();
  const filePath = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await window.sb.storage
    .from("user-avatars")
    .upload(filePath, file, {
      upsert: true
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Não foi possível enviar a foto.");
  }

  const { data } = window.sb.storage
    .from("user-avatars")
    .getPublicUrl(filePath);

  return data?.publicUrl || null;
}

async function saveProfile() {
  const user = window.CoreAuth?.getCurrentUser?.();
  const sb = window.sb;

  if (!user || !sb) {
    setProfileFeedback("Sessão não encontrada.");
    return;
  }

  const fullName = String(profileFullName?.value || "").trim();
  const email = String(profileEmail?.value || "").trim().toLowerCase();
  const password = String(profilePassword?.value || "").trim();
  const passwordConfirm = String(profilePasswordConfirm?.value || "").trim();

  if (!fullName) {
    setProfileFeedback("Digite seu nome completo.");
    return;
  }

  if (!email) {
    setProfileFeedback("Digite seu e-mail.");
    return;
  }

  if (password || passwordConfirm) {
    if (password.length < 6) {
      setProfileFeedback("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== passwordConfirm) {
      setProfileFeedback("A confirmação da senha não confere.");
      return;
    }
  }

  const oldEmail = String(user.email || "").trim().toLowerCase();
  const authChanged = isAuthChangeRequired({
    oldEmail,
    newEmail: email,
    password
  });

  try {
    setProfileFeedback("");

    if (btnProfileSave) {
      btnProfileSave.disabled = true;
      btnProfileSave.textContent = "Salvando...";
    }

    let avatarUrl = currentProfileAvatarUrl || "";

    if (profileAvatarFile) {
      avatarUrl = await uploadProfileAvatar(profileAvatarFile, user.id);
    }

    const { error: profileError } = await sb
      .from("profiles")
      .update({
        full_name: fullName,
        email,
        avatar_path: avatarUrl || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id);

    if (profileError) {
      throw new Error(profileError.message || "Não foi possível atualizar o perfil.");
    }

    if (authChanged) {
      const payload = { email };

      if (password) {
        payload.password = password;
      }

      const { error: authError } = await sb.auth.updateUser(payload);

      if (authError) {
        throw new Error(authError.message || "Não foi possível atualizar os dados de acesso.");
      }
    }

   const resolvedAvatarUrlAfterSave = await resolveAvatarUrl(avatarUrl || "");

    const nextUser = {
      ...user,
      name: fullName,
      full_name: fullName,
      email,
      avatar_path: avatarUrl || null,
      avatarUrl: resolvedAvatarUrlAfterSave || null
    };

    updateUserUI(nextUser);

    if (authChanged) {
      setProfileFeedback(
        "Dados de acesso alterados com sucesso. Você será deslogado para entrar novamente.",
        "success"
      );

      setTimeout(async () => {
        await window.sb.auth.signOut();
        localStorage.removeItem("core_session_v3");
        window.location.href = "index.html";
      }, 1400);

      return;
    }

    currentProfileAvatarUrl = avatarUrl || "";
    profileAvatarFile = null;

    if (profileAvatarInput) {
      profileAvatarInput.value = "";
    }

    setProfileFeedback("Perfil atualizado com sucesso.", "success");
  } catch (err) {
    console.error("[PROFILE] erro ao salvar perfil:", err);
    setProfileFeedback(err?.message || "Não foi possível salvar o perfil.");
  } finally {
    if (btnProfileSave) {
      btnProfileSave.disabled = false;
      btnProfileSave.textContent = "Salvar alterações";
    }
  }
}

async function loadCurrentProfileFromDatabase() {
  const authUser = window.CoreAuth?.getCurrentUser?.();
  if (!authUser?.id || !window.sb) return null;

  const { data, error } = await window.sb
    .from("profiles")
    .select("id, full_name, email, role, avatar_path, status")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) {
    console.error("[PROFILE] erro ao carregar perfil atual:", error);
    return null;
  }

  return data || null;
}

window.CoreUpdateAvatar = async function (userId) {
  try {
    const { data: profile } = await window.sb
      .from("profiles")
      .select("avatar_path")
      .eq("id", userId)
      .single();

    if (!profile?.avatar_path) return;

    const avatarUrl = profile.avatar_path.startsWith("http")
      ? profile.avatar_path
      : window.sb.storage.from("user-avatars").getPublicUrl(profile.avatar_path).data?.publicUrl || "";

    if (!avatarUrl) return;

    // Atualiza elementos visuais
    const topbar = document.getElementById("topbarUserAvatar");
    if (topbar) topbar.innerHTML = `<img src="${avatarUrl}" alt="Avatar">`;

    const preview = document.getElementById("profileAvatarPreview");
    if (preview) preview.innerHTML = `<img src="${avatarUrl}" alt="Avatar">`;

    // Atualiza a sessão em cache com a URL resolvida
    const session = JSON.parse(localStorage.getItem("core_session_v3") || "null");
    if (session) {
      session.avatarUrl = avatarUrl;
      session.avatar_path = profile.avatar_path;
      localStorage.setItem("core_session_v3", JSON.stringify(session));
    }

    // Atualiza variável de controle do modal
    window._coreResolvedAvatarUrl = avatarUrl;

  } catch (e) {
    console.warn("CoreUpdateAvatar error:", e);
  }
};

function updateUserUI(user) {
  const el = document.getElementById("userHello");
  if (!el || !user) return;

  const name = user.name || user.full_name || user.email || "Usuário";
  const role = user.role || "USER";
  const avatarUrl = user.avatarUrl || user.avatar_path || "";

  el.textContent = `${name} (${role})`;

  // Só atualiza o avatar se tiver URL — evita sobrescrever foto já carregada
  const topbarJaTemFoto = topbarUserAvatar?.querySelector("img");
  if (!topbarJaTemFoto) {
    renderAvatarTarget(topbarUserAvatar, { name, avatarUrl });
  }
}