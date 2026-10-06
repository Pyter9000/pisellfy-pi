import { supabase } from "@/integrations/supabase/client";

export type SellfyLevel = "level_0" | "level_1" | "level_2" | "level_3";

export const LEVEL_LABELS: Record<SellfyLevel, string> = {
  level_0: "New Seller",
  level_1: "Sellfy Rising",
  level_2: "Sellfy Pro",
  level_3: "Sellfy Top",
};

export interface Criterion {
  key: string;
  label: string;
  current: number;
  target: number;
  passed: boolean;
  direction: "min" | "max";
  unit?: string;
}

export interface LevelPayload {
  level: SellfyLevel;
  label?: string;
  eligible_level: SellfyLevel;
  pending_manual_review: boolean;
  under_watch: boolean;
  downgrade_warning: string | null;
  performance: Record<string, number | boolean>;
  reputation: Record<string, number | boolean>;
  metrics: Record<string, number>;
  progress: {
    current: { level: SellfyLevel; label: string; criteria: Criterion[] };
    next: { level: SellfyLevel; label: string; criteria: Criterion[] } | null;
  };
  next_best_actions: string[];
}

export interface MissionRow {
  id: string;
  mission_id: string;
  progress: number;
  status: "in_progress" | "completed" | "claimed" | "expired";
  period_key: string;
  missions: {
    code: string;
    title: string;
    description: string;
    period: string;
    target: number;
    reward_points: number;
    reward_xp: number;
    audience: string;
  } | null;
}

export interface BadgeRow {
  awarded_at: string;
  badges: { code: string; name: string; description: string } | null;
}

export interface BoostRow {
  id: string;
  target_label: string;
  target_id: string;
  paid_with: string;
  points_spent: number;
  pi_amount: number;
  status: string;
  starts_at: string;
  ends_at: string;
}

export interface RewardsRow {
  points_balance: number;
  points_lifetime: number;
  xp_total: number;
  buyer_level: number;
  orders_placed: number;
}

/** Every reward/level read and write goes through the server function. */
export async function callRewards<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("sellfy-rewards", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    throw new Error(String((data as Record<string, unknown>).error));
  }
  return data as T;
}

export const getSellerDashboard = () => callRewards("get-seller-dashboard");
export const getBuyerDashboard = () => callRewards("get-buyer-dashboard");
export const recalculateMyLevel = () => callRewards("recalculate");
export const claimMission = (userMissionId: string) => callRewards("claim-mission", { user_mission_id: userMissionId });
export const createBoost = (input: { target_id: string; target_label: string; target_type?: string; paid_with?: "points" | "pi" }) =>
  callRewards("create-boost", input);
export const joinClub = (tier: "standard" | "pro") => callRewards("join-club", { tier });
export const leaveClub = () => callRewards("leave-club");

export const adminOverview = () => callRewards("admin-overview");
export const adminUpdateRequirement = (id: string, patch: Record<string, unknown>) =>
  callRewards("admin-update-requirement", { id, patch });
export const adminAdjustRewards = (input: { user_id: string; points?: number; xp?: number; reason?: string }) =>
  callRewards("admin-adjust-rewards", input);
export const adminGrantTop = (seller_id: string, approve: boolean) =>
  callRewards("admin-grant-top", { seller_id, approve });
export const adminAwardBadge = (user_id: string, code: string) => callRewards("admin-award-badge", { user_id, code });
export const adminRecalculate = (seller_id: string) => callRewards("admin-recalculate-seller", { seller_id });

export const fmtNumber = (n: number, unit?: string) =>
  `${Math.round(Number(n) * 10) / 10}${unit ?? ""}`;

export const adminSetTop = (seller_id: string, mode: "granted" | "rejected" | "auto", reason = "") =>
  callRewards("admin-grant-top", { seller_id, mode, reason });
export const adminRevokeBadge = (user_id: string, code: string) => callRewards("admin-revoke-badge", { user_id, code });
export const adminFlagAction = (flag_id: string, decision: "warn" | "suspend" | "dismiss", reason: string) =>
  callRewards("admin-flag-action", { flag_id, decision, reason });
export const adminUnsuspend = (seller_id: string, reason: string) => callRewards("admin-unsuspend", { seller_id, reason });
