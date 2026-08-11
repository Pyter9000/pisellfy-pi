// App-to-User payout: sends a seller's available balance to their Pi wallet.
// Security: the payout is always derived from the AUTHENTICATED caller's own
// balance — no seller id is ever accepted from the request body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PI_API = "https://api.minepi.com/v2";
const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("PI_NETWORK_API_KEY");
  if (!apiKey) return json({ error: "PI_NETWORK_API_KEY is not configured" }, 500);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let sellerId: string | null = null;
  let payoutId: string | null = null;
  let amount = 0;

  const audit = async (action: string, success: boolean, details: Record<string, unknown> = {}) => {
    await admin.from("payout_audit_log").insert({
      seller_id: sellerId,
      payout_id: payoutId,
      action,
      success,
      amount: amount || null,
      details,
    });
  };

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userData } = await userClient.auth.getUser();
    sellerId = userData?.user?.id ?? null;
    if (!sellerId) {
      await audit("withdraw_request", false, { reason: "unauthorized" });
      return json({ error: "Unauthorized" }, 401);
    }

    // Balance and minimum threshold come from the database, never the client.
    const { data: balance } = await admin
      .from("seller_balances")
      .select("available_balance, total_withdrawn, minimum_payout")
      .eq("seller_id", sellerId)
      .maybeSingle();

    const available = round7(Number(balance?.available_balance ?? 0));
    const minimum = Number(balance?.minimum_payout ?? 5);
    if (available < minimum || available <= 0) {
      await audit("withdraw_request", false, { reason: "below_minimum", available, minimum });
      return json({ error: `Minimum withdrawal is ${minimum} π (available: ${available} π)` }, 400);
    }
    amount = available;

    const { data: profile } = await admin
      .from("profiles")
      .select("pi_uid, pi_username")
      .eq("id", sellerId)
      .maybeSingle();
    if (!profile?.pi_uid) {
      await audit("withdraw_request", false, { reason: "missing_pi_uid" });
      return json({ error: "Your Pi identity is not linked. Sign in with Pi again." }, 400);
    }

    // Reserve the funds first so a failed payout never loses track of what is owed.
    const memo = `Sellfy payout — @${profile.pi_username ?? "pioneer"}`.slice(0, 60);
    const { data: payout, error: payoutErr } = await admin
      .from("payouts")
      .insert({ seller_id: sellerId, amount, memo, status: "pending" })
      .select("id")
      .single();
    if (payoutErr) {
      const rateLimited = /24 hours/i.test(payoutErr.message);
      await audit("withdraw_request", false, { reason: payoutErr.message });
      return json(
        { error: rateLimited ? "Only one withdrawal per 24 hours is allowed." : "Could not create the payout" },
        rateLimited ? 429 : 500,
      );
    }
    payoutId = payout.id;

    await admin
      .from("seller_balances")
      .update({ available_balance: round7(available - amount), pending_balance: amount })
      .eq("seller_id", sellerId);

    await admin
      .from("earnings")
      .update({ payout_status: "processing", payout_id: payoutId })
      .eq("seller_id", sellerId)
      .eq("payout_status", "unpaid");

    const fail = async (message: string, details: Record<string, unknown>, status = 502) => {
      // Restore the balance: the seller is still owed the money.
      await admin
        .from("seller_balances")
        .update({ available_balance: round7(available), pending_balance: 0 })
        .eq("seller_id", sellerId!);
      await admin
        .from("earnings")
        .update({ payout_status: "unpaid", payout_id: null })
        .eq("payout_id", payoutId!);
      await admin
        .from("payouts")
        .update({ status: "failed", error_message: message })
        .eq("id", payoutId!);
      await audit("withdraw_failed", false, details);
      return json({ error: message }, status);
    };

    // A2U payment creation (server-signed with the Pi API key).
    const createRes = await fetch(`${PI_API}/payments`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        payment: {
          amount,
          memo,
          metadata: { type: "seller_payout", payout_id: payoutId, seller_id: sellerId },
          uid: profile.pi_uid,
        },
      }),
    });
    const createBody = await createRes.json().catch(() => null);
    if (!createRes.ok) {
      const detail = typeof createBody?.error === "string" ? createBody.error : `Pi API ${createRes.status}`;
      const insufficient = /insufficient|balance/i.test(JSON.stringify(createBody ?? {}));
      return await fail(
        insufficient
          ? "The platform wallet does not have enough Pi right now. Your balance is safe — try again later."
          : `Pi payout could not be created (${detail})`,
        { status: createRes.status, body: createBody },
      );
    }

    const piPaymentId: string | undefined = createBody?.identifier;
    if (!piPaymentId) return await fail("Pi did not return a payment identifier", { body: createBody });

    await admin
      .from("payouts")
      .update({ pi_payment_id: piPaymentId, status: "approved" })
      .eq("id", payoutId);

    // Pi submits the A2U transaction; poll briefly for the blockchain txid.
    let txid: string | null = createBody?.transaction?.txid ?? null;
    for (let i = 0; i < 5 && !txid; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const lookup = await fetch(`${PI_API}/payments/${piPaymentId}`, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!lookup.ok) break;
      const info = await lookup.json().catch(() => null);
      txid = info?.transaction?.txid ?? null;
    }

    if (txid) {
      const completeRes = await fetch(`${PI_API}/payments/${piPaymentId}/complete`, {
        method: "POST",
        headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ txid }),
      });
      if (!completeRes.ok) {
        console.error("payout complete failed", completeRes.status, await completeRes.text());
      }
    }

    const completed = Boolean(txid);
    await admin
      .from("payouts")
      .update({
        status: completed ? "completed" : "approved",
        txid,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("id", payoutId);

    if (completed) {
      await admin
        .from("seller_balances")
        .update({
          pending_balance: 0,
          total_withdrawn: round7(Number(balance?.total_withdrawn ?? 0) + amount),
        })
        .eq("seller_id", sellerId);
      await admin.from("earnings").update({ payout_status: "paid" }).eq("payout_id", payoutId);
    }

    await audit("withdraw_succeeded", true, { pi_payment_id: piPaymentId, txid, completed });
    return json({ ok: true, payoutId, amount, txid, status: completed ? "completed" : "processing" });
  } catch (e) {
    console.error("pi-payout error", e);
    await audit("withdraw_error", false, { message: e instanceof Error ? e.message : String(e) });
    return json({ error: "Unexpected error during the payout" }, 500);
  }
});
