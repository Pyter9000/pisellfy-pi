// Revenue split engine — BACKEND ONLY.
// Every Pi transaction of the marketplace is split 20% platform / 80% seller.
// The amounts are always recomputed here from the authoritative Pi payment
// amount; anything sent by the client is ignored.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const PLATFORM_COMMISSION_RATE = 0.2;

export type TransactionType = "product" | "service" | "course" | "subscription";

const TYPES: TransactionType[] = ["product", "service", "course", "subscription"];

/** Normalizes an arbitrary metadata value into a supported transaction type. */
export function resolveTransactionType(value: unknown, fallback: TransactionType = "product"): TransactionType {
  const raw = String(value ?? "").toLowerCase();
  if (TYPES.includes(raw as TransactionType)) return raw as TransactionType;
  if (raw.includes("subscription")) return "subscription";
  if (raw.includes("course") || raw.includes("formation")) return "course";
  if (raw.includes("service") || raw.includes("gig") || raw.includes("freelance")) return "service";
  return fallback;
}

const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

export function splitAmount(totalAmount: number, rate = PLATFORM_COMMISSION_RATE) {
  const total = round7(Math.max(0, Number(totalAmount) || 0));
  const platformFee = round7(total * rate);
  return { total, platformFee, sellerEarnings: round7(total - platformFee) };
}

export interface RecordEarningInput {
  sellerId: string | null;
  buyerId: string;
  transactionType: TransactionType;
  referenceId: string;
  paymentId: string;
  totalAmount: number;
}

/**
 * Writes the ledger row for a confirmed payment and credits the seller balance.
 * Idempotent: a second call with the same (transaction_type, payment_id) is a no-op.
 */
export async function recordEarning(admin: SupabaseClient, input: RecordEarningInput) {
  const { total, platformFee, sellerEarnings } = splitAmount(input.totalAmount);

  const { data: existing } = await admin
    .from("earnings")
    .select("id")
    .eq("transaction_type", input.transactionType)
    .eq("payment_id", input.paymentId)
    .maybeSingle();
  if (existing) return { skipped: true, total, platformFee, sellerEarnings };

  const { error: insertErr } = await admin.from("earnings").insert({
    seller_id: input.sellerId,
    buyer_id: input.buyerId,
    transaction_type: input.transactionType,
    reference_id: input.referenceId,
    payment_id: input.paymentId,
    total_amount: total,
    platform_fee: platformFee,
    seller_earnings: sellerEarnings,
    commission_rate: PLATFORM_COMMISSION_RATE,
  });
  if (insertErr) {
    console.error("earnings insert failed", insertErr);
    throw new Error("Could not record the revenue split");
  }

  // Credit the seller's internal balance (platform-owned sales have no seller).
  if (input.sellerId && sellerEarnings > 0) {
    const { data: balance } = await admin
      .from("seller_balances")
      .select("available_balance, total_earned")
      .eq("seller_id", input.sellerId)
      .maybeSingle();

    if (balance) {
      const { error } = await admin
        .from("seller_balances")
        .update({
          available_balance: round7(Number(balance.available_balance) + sellerEarnings),
          total_earned: round7(Number(balance.total_earned) + sellerEarnings),
        })
        .eq("seller_id", input.sellerId);
      if (error) console.error("balance update failed", error);
    } else {
      const { error } = await admin.from("seller_balances").insert({
        seller_id: input.sellerId,
        available_balance: sellerEarnings,
        total_earned: sellerEarnings,
      });
      if (error) console.error("balance insert failed", error);
    }
  }

  return { skipped: false, total, platformFee, sellerEarnings };
}
