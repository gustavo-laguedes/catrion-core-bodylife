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
  const { data: currentProfile, error: currentProfileError } = await adminClient.from("profiles").select("id, email, role, status").eq("id", user.id).single();
  if (currentProfileError || !currentProfile) {
    return {
      ok: false,
      response: jsonResponse({
        error: "Perfil do usuário não encontrado."
      }, 403)
    };
  }
  const currentRole = String(currentProfile.role || "").toUpperCase().trim();
  const currentStatus = String(currentProfile.status || "").toLowerCase().trim();
  if (currentStatus !== "active") {
    return {
      ok: false,
      response: jsonResponse({
        error: "Usuário inativo."
      }, 403)
    };
  }
  if (currentRole !== "ADMIN" && currentRole !== "DEV") {
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
    const email = String(body?.email || "").trim().toLowerCase();
    const fullNameRaw = body?.full_name;
    const role = String(body?.role || "").trim().toUpperCase();
    if (!userId) {
      return jsonResponse({
        error: "ID do usuário é obrigatório."
      }, 400);
    }
    if (!email) {
      return jsonResponse({
        error: "E-mail obrigatório."
      }, 400);
    }
    if (![
      "DEV",
      "ADMIN",
      "ASSOP",
      "OPER",
      "VISU"
    ].includes(role)) {
      return jsonResponse({
        error: "Papel inválido."
      }, 400);
    }
    const fullName = fullNameRaw == null || String(fullNameRaw).trim() === "" ? null : String(fullNameRaw).trim();
    const { data: profile, error: profileError } = await admin.from("profiles").select("id, email, is_protected").eq("id", userId).single();
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
    const { data: emailOwner } = await admin.from("profiles").select("id").eq("email", email).neq("id", userId).maybeSingle();
    if (emailOwner) {
      return jsonResponse({
        error: "Já existe outro usuário com esse e-mail."
      }, 409);
    }
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
      email,
      user_metadata: {
        full_name: fullName ?? ""
      }
    });
    if (authUpdateError) {
      return jsonResponse({
        error: authUpdateError.message || "Não foi possível atualizar o auth do usuário."
      }, 500);
    }
    const { error: profileUpdateError } = await admin.from("profiles").update({
      email,
      full_name: fullName,
      role,
      updated_at: new Date().toISOString()
    }).eq("id", userId);
    if (profileUpdateError) {
      return jsonResponse({
        error: profileUpdateError.message || "Não foi possível atualizar o perfil."
      }, 500);
    }
    const { error: membershipUpdateError } = await admin.from("memberships").update({
      role
    }).eq("user_id", userId);
    if (membershipUpdateError) {
      return jsonResponse({
        error: membershipUpdateError.message || "Não foi possível atualizar o vínculo do usuário."
      }, 500);
    }
    return jsonResponse({
      ok: true,
      message: "Usuário atualizado com sucesso."
    });
  } catch (err) {
    return jsonResponse({
      error: err instanceof Error ? err.message : "Erro desconhecido."
    }, 500);
  }
});
