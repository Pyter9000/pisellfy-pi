// Sellfy Levels engine — BACKEND ONLY.
// Performance, reputation, level, points, XP, badges and missions are all
// computed here from verified data (completed Pi purchases with a txid,
// real reviews, real disputes). Nothing the client sends is trusted.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type SellfyLevel = "level_0" | "level_1" | "level_2" | "level_3";

export const LEVEL_ORDER: SellfyLevel[] = ["level_0", "level_1", "level_2", "level_3"];
export const LEVEL_LABELS: Record<SellfyLevel, string> = {
  level_0: "New Seller",
  level_1: "Sellfy Rising",
  level_2: "Sellfy Pro",
  level_3: "Sellfy Top",
};

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const rank = (l: SellfyLevel) => LEVEL_ORDER.indexOf(l);

/** Minimum verified data before a seller can be ranked or downgraded. */
export const MIN_ORDERS_FOR_SCORING = 3;
/** Observation window (days) before an actual downgrade is applied. */
export const WATCH_PERIOD_DAYS = 14;

export interface LevelRequirement {
  level: SellfyLevel;
  label: string;
  minimum_orders: number;
  minimum_rating: number;
  minimum_response_rate: number;
  maximum_cancellation_rate: number;
  maximum_dispute_rate: number;
  minimum_success_score: number;
  minimum_account_age_days: number;
  minimum_reviews: number;
  manual_review_required: boolean;
  benefits: unknown;
  is_active: boolean;
}

export interface SellerMetrics {
  ordersCompleted: number;
  ordersCancelled: number;
  ordersTotal: number;
  reviewsCount: number;
  averageRating: number;
  disputesCount: number;
  responseRate: number;
  lateDeliveries: number;
  accountAgeDays: number;
}

export interface PerformanceBreakdown {
  success_score: number;
  quality_score: number;
  communication_score: number;
  reliability_score: number;
  order_completion_score: number;
  review_score: number;
  response_score: number;
  cancellation_rate: number;
  dispute_rate: number;
  average_rating: number;
  reviews_count: number;
  data_sufficient: boolean;
}

/** Collects every verified metric for a seller. */
export async function collectSellerMetrics(admin: SupabaseClient, sellerId: string): Promise<SellerMetrics> {
  const [purchases, reviews, disputes, stats, profile] = await Promise.all([
    admin.from("purchases").select("id,status,txid,user_id,created_at").eq("seller_id", sellerId),
    admin.from("seller_reviews").select("rating").eq("seller_id", sellerId),
    admin.from("order_disputes").select("id,status").eq("seller_id", sellerId),
    admin.from("seller_stats").select("*").eq("seller_id", sellerId).maybeSingle(),
    admin.from("profiles").select("created_at").eq("id", sellerId).maybeSingle(),
  ]);

  const rows = purchases.data ?? [];
  // Anti-fraud: self-purchases never count towards performance.
  const legit = rows.filter((r) => r.user_id !== sellerId);
  const completed = legit.filter((r) => r.status === "completed" && r.txid).length;
  const cancelled = legit.filter((r) => r.status === "cancelled").length;

  const ratings = (reviews.data ?? []).map((r) => Number(r.rating));
  const averageRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  const st = stats.data as Record<string, number> | null;
  const received = Number(st?.inquiries_received ?? 0);
  const answered = Number(st?.inquiries_answered ?? 0);
  const responseRate = received > 0 ? (answered / received) * 100 : 100;

  const createdAt = profile.data?.created_at ? new Date(profile.data.created_at as string) : new Date();
  const accountAgeDays = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000));

  return {
    ordersCompleted: completed,
    ordersCancelled: cancelled,
    ordersTotal: completed + cancelled,
    reviewsCount: ratings.length,
    averageRating: round1(averageRating),
    disputesCount: (disputes.data ?? []).length,
    responseRate: round1(responseRate),
    lateDeliveries: Number(st?.late_deliveries ?? 0),
    accountAgeDays,
  };
}

/**
 * Turns metrics into the Sellfy Performance Score (0-100).
 * Revenue is deliberately NOT an input: quality and reliability drive the score.
 */
export function computePerformance(m: SellerMetrics): PerformanceBreakdown {
  const denom = Math.max(1, m.ordersTotal);
  const cancellationRate = round1((m.ordersCancelled / denom) * 100);
  const disputeRate = round1((m.disputesCount / denom) * 100);

  // Neutral (not inflated) baseline when there is no data yet.
  const reviewScore = m.reviewsCount ? clamp((m.averageRating / 5) * 100) : 50;
  const qualityScore = m.reviewsCount
    ? clamp(reviewScore - Math.min(20, m.lateDeliveries * 4))
    : 50;
  const responseScore = clamp(m.responseRate);
  const communicationScore = clamp(responseScore * 0.7 + reviewScore * 0.3);
  const orderCompletionScore = clamp(100 - cancellationRate * 4);
  const reliabilityScore = clamp(100 - cancellationRate * 3 - disputeRate * 6 - m.lateDeliveries * 2);

  const successScore = Math.round(
    clamp(
      qualityScore * 0.3 +
        reliabilityScore * 0.25 +
        orderCompletionScore * 0.15 +
        communicationScore * 0.15 +
        reviewScore * 0.15,
    ),
  );

  return {
    success_score: successScore,
    quality_score: Math.round(qualityScore),
    communication_score: Math.round(communicationScore),
    reliability_score: Math.round(reliabilityScore),
    order_completion_score: Math.round(orderCompletionScore),
    review_score: Math.round(reviewScore),
    response_score: Math.round(responseScore),
    cancellation_rate: cancellationRate,
    dispute_rate: disputeRate,
    average_rating: m.averageRating,
    reviews_count: m.reviewsCount,
    data_sufficient: m.ordersCompleted >= MIN_ORDERS_FOR_SCORING,
  };
}

/** Trust indicator, separate from the performance score. */
export function computeReputation(m: SellerMetrics, p: PerformanceBreakdown) {
  const volumeTrust = clamp(Math.log10(m.ordersCompleted + 1) * 40);
  const score = Math.round(
    clamp(p.review_score * 0.4 + p.reliability_score * 0.3 + volumeTrust * 0.2 + p.response_score * 0.1),
  );
  return {
    reputation_score: score,
    public_rating: m.averageRating,
    public_orders_completed: m.ordersCompleted,
    fast_responder: m.responseRate >= 95 && m.ordersCompleted >= MIN_ORDERS_FOR_SCORING,
    reliable_seller: p.reliability_score >= 90 && m.ordersCompleted >= MIN_ORDERS_FOR_SCORING,
  };
}

export interface CriterionProgress {
  key: string;
  label: string;
  current: number;
  target: number;
  passed: boolean;
  direction: "min" | "max";
  unit?: string;
}

export function evaluateRequirement(
  req: LevelRequirement,
  m: SellerMetrics,
  p: PerformanceBreakdown,
): CriterionProgress[] {
  return [
    { key: "orders", label: "Commandes terminees", current: m.ordersCompleted, target: req.minimum_orders, direction: "min", passed: m.ordersCompleted >= req.minimum_orders },
    { key: "rating", label: "Note moyenne", current: m.averageRating, target: req.minimum_rating, direction: "min", passed: m.averageRating >= req.minimum_rating },
    { key: "reviews", label: "Evaluations recues", current: m.reviewsCount, target: req.minimum_reviews, direction: "min", passed: m.reviewsCount >= req.minimum_reviews },
    { key: "response", label: "Taux de reponse", current: m.responseRate, target: req.minimum_response_rate, direction: "min", unit: "%", passed: m.responseRate >= req.minimum_response_rate },
    { key: "performance", label: "Score de performance", current: p.success_score, target: req.minimum_success_score, direction: "min", passed: p.success_score >= req.minimum_success_score },
    { key: "cancellation", label: "Taux d'annulation", current: p.cancellation_rate, target: req.maximum_cancellation_rate, direction: "max", unit: "%", passed: p.cancellation_rate <= req.maximum_cancellation_rate },
    { key: "disputes", label: "Taux de litige", current: p.dispute_rate, target: req.maximum_dispute_rate, direction: "max", unit: "%", passed: p.dispute_rate <= req.maximum_dispute_rate },
    { key: "age", label: "Anciennete du compte (jours)", current: m.accountAgeDays, target: req.minimum_account_age_days, direction: "min", passed: m.accountAgeDays >= req.minimum_account_age_days },
  ];
}

/** Ranks the failing criteria by impact so the seller knows what to do next. */
export function buildNextBestActions(failing: CriterionProgress[]): string[] {
  const gap = (c: CriterionProgress) =>
    c.direction === "min"
      ? c.target > 0 ? (c.target - c.current) / c.target : 0
      : c.target > 0 ? (c.current - c.target) / Math.max(c.current, 1) : 1;

  const messages: Record<string, (c: CriterionProgress) => string> = {
    orders: (c) => `Terminez ${Math.max(1, Math.ceil(c.target - c.current))} commande(s) supplementaire(s).`,
    rating: (c) => `Ameliorez votre note moyenne pour atteindre ${c.target}/5.`,
    reviews: (c) => `Obtenez ${Math.max(1, Math.ceil(c.target - c.current))} nouvelle(s) evaluation(s).`,
    response: (c) => `Ameliorez votre taux de reponse pour depasser ${c.target}%.`,
    performance: (c) => `Gagnez ${Math.max(1, Math.ceil(c.target - c.current))} point(s) de performance (qualite, fiabilite, reactivite).`,
    cancellation: (c) => `Reduisez votre taux d'annulation sous ${c.target}%.`,
    disputes: (c) => `Reduisez votre taux de litige sous ${c.target}%.`,
    age: (c) => `Votre compte doit avoir ${c.target} jours d'anciennete.`,
  };

  return failing
    .slice()
    .sort((a, b) => gap(b) - gap(a))
    .slice(0, 4)
    .map((c) => messages[c.key]?.(c) ?? c.label);
}

export interface LevelResult {
  level: SellfyLevel;
  eligible_level: SellfyLevel;
  pending_manual_review: boolean;
  under_watch: boolean;
  performance: PerformanceBreakdown;
  reputation: ReturnType<typeof computeReputation>;
  metrics: SellerMetrics;
  progress: {
    current: { level: SellfyLevel; label: string; criteria: CriterionProgress[] };
    next: { level: SellfyLevel; label: string; criteria: CriterionProgress[] } | null;
  };
  next_best_actions: string[];
  downgrade_warning: string | null;
}

/**
 * Full server-side recalculation. The frontend can never declare a level.
 * Downgrades go through an observation window before being applied.
 */
export async function calculateSellerLevel(admin: SupabaseClient, sellerId: string): Promise<LevelResult> {
  const { data: reqRows } = await admin
    .from("seller_level_requirements")
    .select("*")
    .eq("is_active", true);
  const requirements = ((reqRows ?? []) as LevelRequirement[]).sort((a, b) => rank(a.level) - rank(b.level));

  const metrics = await collectSellerMetrics(admin, sellerId);
  const performance = computePerformance(metrics);
  const reputation = computeReputation(metrics, performance);

  // Highest level whose configured criteria are all met.
  let earned: SellfyLevel = "level_0";
  let manualReview = false;
  for (const req of requirements) {
    if (req.level === "level_0") continue;
    const criteria = evaluateRequirement(req, metrics, performance);
    const allPassed = criteria.every((c) => c.passed);
    const enoughData = metrics.ordersCompleted >= Math.max(MIN_ORDERS_FOR_SCORING, 1);
    if (allPassed && enoughData) {
      if (req.manual_review_required) {
        manualReview = true;
        break; // eligible, but Sellfy must validate before granting the level
      }
      earned = req.level;
    } else {
      break;
    }
  }
  const eligible: SellfyLevel = manualReview
    ? (LEVEL_ORDER[Math.min(rank(earned) + 1, LEVEL_ORDER.length - 1)] as SellfyLevel)
    : earned;

  const { data: existing } = await admin
    .from("seller_levels")
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  const previous = (existing?.level ?? "level_0") as SellfyLevel;
  const manuallyGranted = existing?.level === "level_3" && rank(earned) < 3;

  let level = previous;
  let underWatch = false;
  let watchStartedAt: string | null = existing?.watch_started_at ?? null;
  let downgradeWarning: string | null = null;

  if (rank(earned) > rank(previous)) {
    level = earned;
    underWatch = false;
    watchStartedAt = null;
  } else if (rank(earned) < rank(previous) && !manuallyGranted) {
    if (!performance.data_sufficient) {
      // Not enough verified data — never downgrade on thin evidence.
      underWatch = false;
    } else {
      const startedAt = watchStartedAt ? new Date(watchStartedAt) : null;
      const daysUnderWatch = startedAt ? (Date.now() - startedAt.getTime()) / 86_400_000 : 0;
      if (!startedAt) {
        underWatch = true;
        watchStartedAt = new Date().toISOString();
        downgradeWarning = "Votre niveau est sous surveillance.";
      } else if (daysUnderWatch < WATCH_PERIOD_DAYS) {
        underWatch = true;
        downgradeWarning =
          "Vous risquez de perdre votre niveau si vos performances continuent de diminuer.";
      } else {
        level = LEVEL_ORDER[Math.max(0, rank(previous) - 1)] as SellfyLevel;
        underWatch = false;
        watchStartedAt = null;
        downgradeWarning = "Votre niveau a ete ajuste apres la periode d'observation.";
      }
    }
  }

  const currentReq = requirements.find((r) => r.level === level) ?? requirements[0];
  const nextLevel = LEVEL_ORDER[rank(level) + 1] as SellfyLevel | undefined;
  const nextReq = nextLevel ? requirements.find((r) => r.level === nextLevel) : undefined;

  const currentCriteria = currentReq ? evaluateRequirement(currentReq, metrics, performance) : [];
  const nextCriteria = nextReq ? evaluateRequirement(nextReq, metrics, performance) : [];
  const nextBestActions = buildNextBestActions(nextCriteria.filter((c) => !c.passed));

  const progress = {
    current: { level, label: LEVEL_LABELS[level], criteria: currentCriteria },
    next: nextReq
      ? { level: nextReq.level, label: LEVEL_LABELS[nextReq.level], criteria: nextCriteria }
      : null,
  };

  const nowIso = new Date().toISOString();

  await admin.from("seller_performance").upsert(
    { seller_id: sellerId, ...performance, calculated_at: nowIso },
    { onConflict: "seller_id" },
  );
  await admin.from("seller_reputation").upsert(
    { seller_id: sellerId, ...reputation, calculated_at: nowIso },
    { onConflict: "seller_id" },
  );
  await admin.from("seller_levels").upsert(
    {
      seller_id: sellerId,
      level,
      eligible_level: eligible,
      pending_manual_review: manualReview && rank(eligible) > rank(level),
      under_watch: underWatch,
      watch_started_at: watchStartedAt,
      downgrade_warned_at: downgradeWarning ? nowIso : existing?.downgrade_warned_at ?? null,
      level_since: level === previous ? existing?.level_since ?? nowIso : nowIso,
      progress,
      next_best_actions: nextBestActions,
      calculated_at: nowIso,
    },
    { onConflict: "seller_id" },
  );
  await admin.from("seller_stats").upsert(
    {
      seller_id: sellerId,
      orders_completed: metrics.ordersCompleted,
      orders_cancelled: metrics.ordersCancelled,
    },
    { onConflict: "seller_id" },
  );

  if (level !== previous) {
    await admin.from("reward_audit_logs").insert({
      user_id: sellerId,
      action: rank(level) > rank(previous) ? "level_upgrade" : "level_downgrade",
      details: { from: previous, to: level, performance: performance.success_score },
    });
  }

  await syncSellerBadges(admin, sellerId, metrics, performance, level);

  return {
    level,
    eligible_level: eligible,
    pending_manual_review: manualReview && rank(eligible) > rank(level),
    under_watch: underWatch,
    performance,
    reputation,
    metrics,
    progress,
    next_best_actions: nextBestActions,
    downgrade_warning: downgradeWarning,
  };
}

/** Awards a badge once, idempotently. */
export async function awardBadge(admin: SupabaseClient, userId: string, code: string) {
  const { data: badge } = await admin.from("badges").select("id").eq("code", code).maybeSingle();
  if (!badge) return false;
  const { error } = await admin
    .from("user_badges")
    .upsert({ user_id: userId, badge_id: badge.id }, { onConflict: "user_id,badge_id", ignoreDuplicates: true });
  if (error) return false;
  await admin.from("reward_audit_logs").insert({ user_id: userId, action: "badge_awarded", details: { code } });
  return true;
}

export async function syncSellerBadges(
  admin: SupabaseClient,
  sellerId: string,
  m: SellerMetrics,
  p: PerformanceBreakdown,
  level: SellfyLevel,
) {
  const earned: string[] = [];
  if (m.ordersCompleted >= 1) earned.push("first_sale");
  if (rank(level) >= 1) earned.push("rising_seller");
  if (rank(level) >= 2) earned.push("pro_seller");
  if (rank(level) >= 3) earned.push("top_seller");
  if (m.averageRating >= 4.9 && m.reviewsCount >= 10) earned.push("top_rated");
  if (m.responseRate >= 95 && m.ordersCompleted >= MIN_ORDERS_FOR_SCORING) earned.push("fast_response");
  if (p.cancellation_rate <= 2 && m.ordersCompleted >= 20) earned.push("reliable_seller");
  if (m.ordersCompleted >= 100) earned.push("orders_100");
  if (m.ordersCompleted >= 500) earned.push("orders_500");
  for (const code of earned) await awardBadge(admin, sellerId, code);
}

async function ensureRewards(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from("user_rewards").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as Record<string, number>;
  const { data: created } = await admin
    .from("user_rewards")
    .insert({ user_id: userId })
    .select("*")
    .maybeSingle();
  return (created ?? { points_balance: 0, points_lifetime: 0, xp_total: 0, buyer_level: 0, orders_placed: 0 }) as Record<string, number>;
}

const DAILY_POINTS_CAP = 500;
const DAILY_XP_CAP = 500;

async function dailyTotal(admin: SupabaseClient, table: string, userId: string) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await admin.from(table).select("amount").eq("user_id", userId).gte("created_at", since);
  return (data ?? []).reduce((sum, r) => sum + Math.max(0, Number(r.amount)), 0);
}

/** Idempotent points grant, capped per 24h and always journalised. */
export async function awardPoints(
  admin: SupabaseClient,
  userId: string,
  amount: number,
  reason: string,
  sourceType: string,
  sourceId: string | null,
) {
  if (!Number.isFinite(amount) || amount === 0) return { skipped: true };
  if (amount > 0) {
    const spent = await dailyTotal(admin, "points_transactions", userId);
    if (spent + amount > DAILY_POINTS_CAP) {
      await admin.from("reward_fraud_flags").insert({
        user_id: userId,
        kind: "points_daily_cap",
        details: { reason, sourceType, sourceId, amount },
      });
      return { skipped: true, capped: true };
    }
  }
  const rewards = await ensureRewards(admin, userId);
  const balance = Math.max(0, Number(rewards.points_balance) + amount);
  const { error } = await admin.from("points_transactions").insert({
    user_id: userId, amount, reason, source_type: sourceType, source_id: sourceId, balance_after: balance,
  });
  if (error) return { skipped: true, duplicate: true };
  await admin.from("user_rewards").update({
    points_balance: balance,
    points_lifetime: Number(rewards.points_lifetime) + Math.max(0, amount),
  }).eq("user_id", userId);
  await admin.from("reward_audit_logs").insert({ user_id: userId, action: "points_change", details: { amount, reason, sourceType, sourceId } });
  return { skipped: false, balance };
}

/** Idempotent XP grant. XP measures experience, never quality. */
export async function awardXp(
  admin: SupabaseClient,
  userId: string,
  amount: number,
  reason: string,
  sourceType: string,
  sourceId: string | null,
) {
  if (!Number.isFinite(amount) || amount <= 0) return { skipped: true };
  const gained = await dailyTotal(admin, "xp_transactions", userId);
  if (gained + amount > DAILY_XP_CAP) {
    await admin.from("reward_fraud_flags").insert({
      user_id: userId, kind: "xp_daily_cap", details: { reason, sourceType, sourceId, amount },
    });
    return { skipped: true, capped: true };
  }
  const rewards = await ensureRewards(admin, userId);
  const total = Number(rewards.xp_total) + amount;
  const { error } = await admin.from("xp_transactions").insert({
    user_id: userId, amount, reason, source_type: sourceType, source_id: sourceId, total_after: total,
  });
  if (error) return { skipped: true, duplicate: true };
  await admin.from("user_rewards").update({ xp_total: total }).eq("user_id", userId);
  return { skipped: false, total };
}

export function periodKey(period: string, at = new Date()) {
  const y = at.getUTCFullYear();
  if (period === "daily") return at.toISOString().slice(0, 10);
  if (period === "weekly") {
    const start = new Date(Date.UTC(y, 0, 1));
    const week = Math.ceil(((at.getTime() - start.getTime()) / 86_400_000 + start.getUTCDay() + 1) / 7);
    return `${y}-W${String(week).padStart(2, "0")}`;
  }
  if (period === "monthly") return at.toISOString().slice(0, 7);
  return "special";
}

/** Progresses every mission tracking a given metric. */
export async function trackMissionMetric(
  admin: SupabaseClient,
  userId: string,
  metric: string,
  increment = 1,
  audience: "seller" | "buyer" = "seller",
) {
  const { data: missions } = await admin
    .from("missions")
    .select("*")
    .eq("metric", metric)
    .eq("audience", audience)
    .eq("is_active", true);

  for (const mission of missions ?? []) {
    const key = periodKey(mission.period as string);
    const { data: row } = await admin
      .from("user_missions")
      .select("*")
      .eq("user_id", userId)
      .eq("mission_id", mission.id)
      .eq("period_key", key)
      .maybeSingle();

    const progress = Math.min(Number(mission.target), Number(row?.progress ?? 0) + increment);
    const completed = progress >= Number(mission.target);
    const status = row?.status === "claimed" ? "claimed" : completed ? "completed" : "in_progress";

    await admin.from("user_missions").upsert(
      {
        user_id: userId,
        mission_id: mission.id,
        period_key: key,
        progress,
        status,
        completed_at: completed ? row?.completed_at ?? new Date().toISOString() : null,
      },
      { onConflict: "user_id,mission_id,period_key" },
    );
  }
}

/** Grants a completed mission's rewards. Server-verified progress only. */
export async function claimMission(admin: SupabaseClient, userId: string, userMissionId: string) {
  const { data: row } = await admin
    .from("user_missions")
    .select("*, missions(*)")
    .eq("id", userMissionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return { error: "Mission introuvable" };
  const mission = (row as Record<string, any>).missions;
  if (row.status === "claimed") return { error: "Recompense deja reclamee" };
  if (Number(row.progress) < Number(mission.target)) return { error: "Mission non terminee" };

  const source = `${userMissionId}`;
  if (mission.reward_points) await awardPoints(admin, userId, mission.reward_points, `Mission: ${mission.title}`, "mission", source);
  if (mission.reward_xp) await awardXp(admin, userId, mission.reward_xp, `Mission: ${mission.title}`, "mission", source);
  if (mission.reward_badge_code) await awardBadge(admin, userId, mission.reward_badge_code);
  if (mission.reward_boost_hours) {
    await admin.from("seller_boosts").insert({
      seller_id: userId,
      target_type: "profile",
      target_id: userId,
      target_label: "Boost de mission",
      paid_with: "mission",
      status: "active",
      ends_at: new Date(Date.now() + Number(mission.reward_boost_hours) * 3600_000).toISOString(),
    });
  }

  await admin
    .from("user_missions")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .eq("id", userMissionId);

  return { ok: true, points: mission.reward_points, xp: mission.reward_xp };
}

/** Called after a Pi purchase is confirmed on-chain. */
export async function onPurchaseCompleted(
  admin: SupabaseClient,
  purchase: { id: string; user_id: string; seller_id: string | null; amount: number; txid: string | null },
) {
  if (!purchase.txid) return;
  if (purchase.seller_id && purchase.seller_id === purchase.user_id) {
    await admin.from("reward_fraud_flags").insert({
      user_id: purchase.user_id,
      kind: "self_purchase",
      severity: "critical",
      details: { purchase_id: purchase.id },
    });
    return;
  }

  // Buyer side
  const buyer = await ensureRewards(admin, purchase.user_id);
  await admin
    .from("user_rewards")
    .update({ orders_placed: Number(buyer.orders_placed) + 1 })
    .eq("user_id", purchase.user_id);
  await awardXp(admin, purchase.user_id, 20, "Commande passee", "purchase", purchase.id);
  await awardPoints(admin, purchase.user_id, 15, "Commande passee", "purchase", purchase.id);
  await awardBadge(admin, purchase.user_id, "first_order");
  await trackMissionMetric(admin, purchase.user_id, "orders_placed", 1, "buyer");
  await recomputeBuyerLevel(admin, purchase.user_id);

  // Seller side
  if (purchase.seller_id) {
    await awardXp(admin, purchase.seller_id, 40, "Commande terminee", "purchase", purchase.id);
    await awardPoints(admin, purchase.seller_id, 25, "Commande terminee", "purchase", purchase.id);
    await trackMissionMetric(admin, purchase.seller_id, "orders_completed", 1, "seller");
    await calculateSellerLevel(admin, purchase.seller_id);
  }
}

export async function recomputeBuyerLevel(admin: SupabaseClient, userId: string) {
  const rewards = await ensureRewards(admin, userId);
  const orders = Number(rewards.orders_placed);
  const level = orders >= 40 ? 3 : orders >= 15 ? 2 : orders >= 3 ? 1 : 0;
  if (level !== Number(rewards.buyer_level)) {
    await admin.from("user_rewards").update({ buyer_level: level }).eq("user_id", userId);
    await admin.from("reward_audit_logs").insert({ user_id: userId, action: "buyer_level_change", details: { level, orders } });
  }
  return level;
}
