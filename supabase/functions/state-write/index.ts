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
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { dayKey, weekKey, daily, weekly, zone2, weekendPlan } = body;
  if (!dayKey || !weekKey) return json({ error: "missing dayKey or weekKey" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const weeklyRow = {
    week_key: weekKey,
    weekly: weekly ?? {},
    zone2: typeof zone2 === "number" ? zone2 : 0,
  };
  if (weekendPlan !== undefined) weeklyRow.weekend_plan = weekendPlan;

  const [day, week] = await Promise.all([
    supabase
      .from("daily_state")
      .upsert({ day_key: dayKey, daily: daily ?? {} }, { onConflict: "day_key" }),
    supabase.from("weekly_state").upsert(weeklyRow, { onConflict: "week_key" }),
  ]);

  if (day.error || week.error) {
    return json({ error: "db error", detail: day.error?.message || week.error?.message }, 500);
  }

  return json({ ok: true });
});
