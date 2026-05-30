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
  const { dayKey, weekKey } = body;
  if (!dayKey || !weekKey) return json({ error: "missing dayKey or weekKey" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const [day, week] = await Promise.all([
    supabase.from("daily_state").select("daily").eq("day_key", dayKey).maybeSingle(),
    supabase
      .from("weekly_state")
      .select("weekly, zone2, plan_mon, plan_tue, plan_wed, plan_thu, plan_fri, plan_sat, plan_sun")
      .eq("week_key", weekKey)
      .maybeSingle(),
  ]);

  if (day.error || week.error) {
    return json({ error: "db error", detail: day.error?.message || week.error?.message }, 500);
  }

  return json({
    dayKey,
    weekKey,
    daily: day.data?.daily ?? {},
    weekly: week.data?.weekly ?? {},
    zone2: week.data?.zone2 ?? 0,
    socialPlans: {
      mon: week.data?.plan_mon ?? "",
      tue: week.data?.plan_tue ?? "",
      wed: week.data?.plan_wed ?? "",
      thu: week.data?.plan_thu ?? "",
      fri: week.data?.plan_fri ?? "",
      sat: week.data?.plan_sat ?? "",
      sun: week.data?.plan_sun ?? "",
    },
  });
});
