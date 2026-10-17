/**
 * 아임웹 주문 웹훅 — 69번 상품이면 1년 이용권 부여/연장
 * 아임웹이 직접 부르지 않고, timeisprice imweb-order-webhook이 69번만 넘긴다.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normalizeImwebOrderPayload } from "../_shared/imwebPayload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-imweb-webhook-secret, webhook-secret",
};

const EXPECTED_SITE_CODE = (Deno.env.get("IMWEB_SITE_CODE") || "").trim();

function readWebhookSecret(req: Request): string {
  const direct =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-imweb-webhook-secret") ||
    req.headers.get("webhook-secret") ||
    "";
  return direct.replace(/^Bearer\s+/i, "").trim();
}

function verifyWebhookSecret(req: Request): boolean {
  const expected = (Deno.env.get("IMWEB_WEBHOOK_SECRET") || "").trim();
  if (!expected) {
    console.warn("IMWEB_WEBHOOK_SECRET not set — rejecting webhook");
    return false;
  }
  if (readWebhookSecret(req) === expected) return true;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("imweb_secret") === expected) return true;
  } catch {
    // ignore
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!verifyWebhookSecret(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const raw = await req.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = normalizeImwebOrderPayload(parsed);

  if (payload.orderNo == null && payload.ordererEmail == null) {
    console.warn("imweb-order-webhook: unrecognized payload keys", {
      topKeys: Object.keys(parsed),
    });
  }

  if (
    EXPECTED_SITE_CODE &&
    String(payload.siteCode || "").trim() !== EXPECTED_SITE_CODE
  ) {
    return new Response(
      JSON.stringify({ ok: true, ignored: true, reason: "site_code_mismatch" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data, error } = await admin.rpc("process_imweb_order_webhook", {
    p_payload: payload,
  });

  if (error) {
    console.error("process_imweb_order_webhook", error);
    return new Response(
      JSON.stringify({ error: "grant_failed", detail: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  console.log("imweb-order-webhook", {
    orderNo: payload.orderNo,
    email: payload.ordererEmail,
    result: data,
  });

  return new Response(JSON.stringify(data ?? { ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
