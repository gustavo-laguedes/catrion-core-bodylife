import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const FIXED_TENANT_ID = "11111111-1111-1111-1111-111111111111";
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}
async function requireAdminUser(req) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return {
      ok: false,
      response: jsonResponse({
        error: "Secrets do Supabase não configuradas."
      }, 500)
    };
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      ok: false,
      response: jsonResponse({
        error: "Usuário não autenticado."
      }, 401)
    };
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user?.id) {
    return {
      ok: false,
      response: jsonResponse({
        error: "Sessão inválida ou expirada."
      }, 401)
    };
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile, error: profileError } = await adminClient.from("profiles").select("id, email, role, status").eq("id", user.id).single();
  if (profileError || !profile) {
    return {
      ok: false,
      response: jsonResponse({
        error: "Perfil do usuário não encontrado."
      }, 403)
    };
  }
  const role = String(profile.role || "").toUpperCase().trim();
  const status = String(profile.status || "").toLowerCase().trim();
  if (status !== "active") {
    return {
      ok: false,
      response: jsonResponse({
        error: "Usuário inativo."
      }, 403)
    };
  }
  if (role !== "ADMIN" && role !== "DEV") {
    return {
      ok: false,
      response: jsonResponse({
        error: "Sem permissão administrativa."
      }, 403)
    };
  }
  return {
    ok: true,
    adminClient
  };
}
Deno.serve(async (req)=>{
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }
    const auth = await requireAdminUser(req);
    if (!auth.ok) return auth.response;
    const admin = auth.adminClient;
    const body = await req.json().catch(()=>({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toUpperCase();
    if (!email) {
      return jsonResponse({
        error: "E-mail obrigatório."
      }, 400);
    }
    if (![
      "ADMIN",
      "ASSOP",
      "OPER",
      "VISU",
      "DEV"
    ].includes(role)) {
      return jsonResponse({
        error: "Papel inválido."
      }, 400);
    }
    const { data: existingProfile } = await admin.from("profiles").select("id, email").eq("email", email).maybeSingle();
    if (existingProfile) {
      return jsonResponse({
        error: "Já existe um usuário com esse e-mail."
      }, 409);
    }
    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {}
    });
    if (createError || !createdUser?.user?.id) {
      return jsonResponse({
        error: createError?.message || "Não foi possível criar usuário."
      }, 500);
    }
    const userId = createdUser.user.id;
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      email,
      full_name: null,
      avatar_path: null,
      role,
      status: "active",
      first_access_completed: false,
      is_protected: false
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({
        error: profileError.message || "Não foi possível criar perfil."
      }, 500);
    }
    const { error: membershipError } = await admin.from("memberships").insert({
      user_id: userId,
      tenant_id: FIXED_TENANT_ID,
      role
    });
    if (membershipError) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({
        error: membershipError.message || "Não foi possível criar vínculo do usuário com o tenant."
      }, 500);
    }
    const origin = req.headers.get("origin") || "https://bodylife.core.catrion.com.br";
    const redirectTo = `${origin}/pages/first-access/first-access.html`;
    const { error: resetError } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo
    });
    if (resetError) {
      return jsonResponse({
        ok: true,
        warning: "Usuário criado e vinculado ao tenant, mas não foi possível enviar o e-mail de primeiro acesso.",
        user: {
          id: userId,
          email,
          role,
          status: "active",
          first_access_completed: false
        }
      });
    }
    return jsonResponse({
      ok: true,
      message: "Usuário criado, vinculado ao tenant e e-mail de primeiro acesso enviado.",
      user: {
        id: userId,
        email,
        role,
        status: "active",
        first_access_completed: false
      }
    });
  } catch (err) {
    return jsonResponse({
      error: err instanceof Error ? err.message : "Erro desconhecido."
    }, 500);
  }
});
