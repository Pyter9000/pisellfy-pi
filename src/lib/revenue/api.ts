import { supabase } from "@/integrations/supabase/client";

export const PLATFORM_COMMISSION_RATE = 0.2;
export const SELLER_SHARE_RATE = 0.8;

export type TransactionType = "product" | "service" | "course" | "subscription";
export type EarningPayoutStatus = "unpaid" | "processing" | "paid";
export type PayoutState = "pending" | "approved" | "completed" | "failed" | "cancelled";

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  product: "Produit",
  service: "Service freelance",
  course: "Formation",
  subscription: "Abonnement",
};

export const PAYOUT_STATE_LABELS: Record<PayoutState, string> = {
  pending: "En attente",
  approved: "En cours",
  completed: "Payé",
  failed: "Échoué",
  cancelled: "Annulé",
};

export interface Earning {
  id: string;
  seller_id: string | null;
  buyer_id: string;
  transaction_type: TransactionType;
  reference_id: string;
  payment_id: string | null;
  total_amount: number;
  platform_fee: number;
  seller_earnings: number;
  payout_status: EarningPayoutStatus;
  created_at: string;
}

export interface SellerBalance {
  seller_id: string;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
  minimum_payout: number;
}

export interface Payout {
  id: string;
  seller_id: string;
  amount: number;
  txid: string | null;
  status: PayoutState;
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
}

const num = (v: unknown) => Number(v ?? 0);

export async function getMyBalance(sellerId: string): Promise<SellerBalance> {
  const { data, error } = await supabase
    .from("seller_balances")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    seller_id: sellerId,
    available_balance: num(data?.available_balance),
    pending_balance: num(data?.pending_balance),
    total_earned: num(data?.total_earned),
    total_withdrawn: num(data?.total_withdrawn),
    minimum_payout: data?.minimum_payout != null ? num(data.minimum_payout) : 5,
  };
}

export async function listMyEarnings(sellerId: string): Promise<Earning[]> {
  const { data, error } = await supabase
    .from("earnings")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as unknown as Earning),
    total_amount: num(row.total_amount),
    platform_fee: num(row.platform_fee),
    seller_earnings: num(row.seller_earnings),
  }));
}

export async function listMyPayouts(sellerId: string): Promise<Payout[]> {
  const { data, error } = await supabase
    .from("payouts")
    .select("*")
    .eq("seller_id", sellerId)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...(row as unknown as Payout), amount: num(row.amount) }));
}

export interface WithdrawResult {
  amount: number;
  txid: string | null;
  status: "completed" | "processing";
}

/** Requests an App-to-User payout of the caller's own balance. */
export async function requestWithdrawal(): Promise<WithdrawResult> {
  const { data, error } = await supabase.functions.invoke("pi-payout", { body: {} });
  if (error) {
    const message = (data as { error?: string } | null)?.error ?? error.message;
    throw new Error(message);
  }
  if ((data as { error?: string })?.error) throw new Error(String((data as { error: string }).error));
  const result = data as { amount: number; txid: string | null; status: "completed" | "processing" };
  return result;
}

/* ---------- Admin ---------- */

export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function listAllEarnings(): Promise<Earning[]> {
  const { data, error } = await supabase
    .from("earnings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as unknown as Earning),
    total_amount: num(row.total_amount),
    platform_fee: num(row.platform_fee),
    seller_earnings: num(row.seller_earnings),
  }));
}

export async function listAllPayouts(): Promise<Payout[]> {
  const { data, error } = await supabase
    .from("payouts")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...(row as unknown as Payout), amount: num(row.amount) }));
}

export const formatPi = (value: number) =>
  `π ${value.toLocaleString("fr-FR", { maximumFractionDigits: 4 })}`;
