// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_SECRET = Deno.env.get("APP_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-habit-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!APP_SECRET || req.headers.get("x-habit-secret") !== APP_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { fromDay, toDay } = body;
  if (!fromDay || !toDay) return json({ error: "missing fromDay or toDay" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data, error } = await supabase
    .from("daily_state")
    .select("day_key, daily")
    .gte("day_key", fromDay)
    .lte("day_key", toDay)
    .order("day_key", { ascending: false });

  if (error) {
    return json({ error: "db error", detail: error.message }, 500);
  }

  return json({ rows: data || [] });
});
