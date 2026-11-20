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

// Sets one habit for one day and leaves everything else alone: that day's other
// habits and the whole week row. It's for writers that only know about a single
// habit (Bonjour-hi ticks "French lesson" when a Learn session is finished).
// state-write, by contrast, replaces the day and the week with what it's sent.
//
// Body: { dayKey: "YYYY-MM-DD", habit: "<key in DAILY_HABITS>", done?: boolean }
// `done` defaults to true.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!APP_SECRET || req.headers.get("x-habit-secret") !== APP_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { dayKey, habit } = body ?? {};
  const done = body?.done !== false;
  if (typeof dayKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey) ||
      typeof habit !== "string" || !habit) {
    return json({ error: "missing dayKey or habit" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Read the day, change the one key, write the day back. (Not atomic: a write
  // from the app landing between the two would be lost. They're milliseconds apart.)
  const current = await supabase
    .from("daily_state")
    .select("daily")
    .eq("day_key", dayKey)
    .maybeSingle();
  if (current.error) return json({ error: "db error", detail: current.error.message }, 500);

  const daily = current.data?.daily ?? {};
  if (daily[habit] === done) return json({ ok: true, dayKey, habit, done, changed: false });

  const saved = await supabase
    .from("daily_state")
    .upsert({ day_key: dayKey, daily: { ...daily, [habit]: done } }, { onConflict: "day_key" });
  if (saved.error) return json({ error: "db error", detail: saved.error.message }, 500);

  return json({ ok: true, dayKey, habit, done, changed: true });
});
