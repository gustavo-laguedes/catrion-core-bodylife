(function () {
  const BASE_HEADERS = {
    "Content-Type": "application/json",
    "apikey": window.ENV.SUPABASE_ANON_KEY
  };

  async function getAdminHeaders() {
    if (!window.sb?.auth?.getSession) {
      throw new Error("Sessão do Supabase não disponível.");
    }

    const { data, error } = await window.sb.auth.getSession();

    if (error) {
      throw new Error("Falha ao ler sessão do usuário.");
    }

    const accessToken = data?.session?.access_token;

    if (!accessToken) {
      throw new Error("Usuário não autenticado.");
    }

    return {
      ...BASE_HEADERS,
      Authorization: `Bearer ${accessToken}`
    };
  }

  async function callFn(name, body = {}) {
    const headers = await getAdminHeaders();

    const response = await fetch(
      `${window.ENV.SUPABASE_URL}/functions/v1/${name}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      }
    );

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || "Falha na chamada administrativa.");
    }

    return payload;
  }

  async function verifyAdminPassword({ password }) {
    return callFn("admin-verify-password", { password });
  }

  async function listUsers() {
    return callFn("admin-list-users");
  }

  async function createUser({ email, role }) {
    return callFn("admin-create-user", { email, role });
  }

  async function updateUser({ user_id, full_name, email, role }) {
    return callFn("admin-update-user", {
      user_id,
      full_name,
      email,
      role
    });
  }

  async function toggleUserStatus({ user_id, status }) {
    return callFn("admin-toggle-user-status", {
      user_id,
      status
    });
  }

  async function deleteUser({ user_id }) {
    return callFn("admin-delete-user", { user_id });
  }

  async function sendFirstAccess({ user_id }) {
    return callFn("admin-send-first-access", { user_id });
  }

  window.AdminApi = {
    verifyAdminPassword,
    listUsers,
    createUser,
    updateUser,
    toggleUserStatus,
    deleteUser,
    sendFirstAccess
  };
})();
