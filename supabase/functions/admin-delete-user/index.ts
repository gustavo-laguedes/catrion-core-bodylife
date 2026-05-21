import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
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
    const userId = String(body?.user_id || "").trim();
    if (!userId) {
      return jsonResponse({
        error: "ID do usuário é obrigatório."
      }, 400);
    }
    const { data: profile, error: profileError } = await admin.from("profiles").select("id, is_protected").eq("id", userId).single();
    if (profileError || !profile) {
      return jsonResponse({
        error: "Usuário não encontrado."
      }, 404);
    }
    if (profile.is_protected) {
      return jsonResponse({
        error: "Usuário protegido."
      }, 403);
    }
    const { error: membershipDeleteError } = await admin.from("memberships").delete().eq("user_id", userId);
    if (membershipDeleteError) {
      return jsonResponse({
        error: membershipDeleteError.message || "Não foi possível excluir os vínculos do usuário."
      }, 500);
    }
    const { error: profileDeleteError } = await admin.from("profiles").delete().eq("id", userId);
    if (profileDeleteError) {
      return jsonResponse({
        error: profileDeleteError.message || "Não foi possível excluir o perfil do usuário."
      }, 500);
    }
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      return jsonResponse({
        error: authDeleteError.message || "Não foi possível excluir o usuário no Auth."
      }, 500);
    }
    return jsonResponse({
      ok: true,
      message: "Usuário excluído com sucesso."
    });
  } catch (err) {
    return jsonResponse({
      error: err instanceof Error ? err.message : "Erro desconhecido."
    }, 500);
  }
});
