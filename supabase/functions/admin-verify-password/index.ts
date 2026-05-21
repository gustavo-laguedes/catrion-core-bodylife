import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(String(a));
  const bBytes = enc.encode(String(b));
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for(let i = 0; i < aBytes.length; i++){
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return json({
      error: "Método não permitido."
    }, 405);
  }
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const CORE_ADMIN_MASTER_PASSWORD = Deno.env.get("CORE_ADMIN_MASTER_PASSWORD");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({
        error: "Secrets do Supabase não configuradas."
      }, 500);
    }
    if (!CORE_ADMIN_MASTER_PASSWORD) {
      return json({
        error: "Secret da senha administrativa não configurada."
      }, 500);
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({
        error: "Usuário não autenticado."
      }, 401);
    }
    let body = {};
    try {
      body = await req.json();
    } catch  {
      return json({
        error: "Body inválido."
      }, 400);
    }
    const password = String(body?.password || "").trim();
    if (!password) {
      return json({
        error: "Senha obrigatória."
      }, 400);
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user?.id) {
      return json({
        error: "Sessão inválida ou expirada."
      }, 401);
    }
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile, error: profileError } = await adminClient.from("profiles").select("id, email, role, status").eq("id", user.id).single();
    if (profileError || !profile) {
      return json({
        error: "Perfil do usuário não encontrado."
      }, 403);
    }
    const role = String(profile.role || "").toUpperCase().trim();
    const status = String(profile.status || "active").toLowerCase().trim();
    if (status !== "active") {
      return json({
        error: "Usuário inativo."
      }, 403);
    }
    if (role !== "ADMIN" && role !== "DEV") {
      return json({
        error: "Sem permissão administrativa."
      }, 403);
    }
    const passwordMatches = safeEqual(password, CORE_ADMIN_MASTER_PASSWORD);
    if (!passwordMatches) {
      return json({
        error: "Senha inválida."
      }, 401);
    }
    return json({
      ok: true,
      authorized: true,
      role,
      user_id: user.id
    });
  } catch (error) {
    console.error("[admin-verify-password] erro:", error);
    return json({
      error: error instanceof Error ? error.message : "Erro interno."
    }, 500);
  }
});
