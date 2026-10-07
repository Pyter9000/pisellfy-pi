// Sellfy Levels & Rewards API.
// Every read/write goes through the authenticated caller's own identity.
// The client can never declare a level, a score, a points balance or a badge.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@4";
import {
  calculateSellerLevel,
  claimMission,
  awardPoints,
  awardXp,
  awardBadge,
  trackMissionMetric,
  recomputeBuyerLevel,
  periodKey,
  LEVEL_LABELS,
} from "../_shared/sellfyLevels.ts";

const uuid = z.string().uuid();
const reasonSchema = z.string().trim().min(1).max(300);
const requirementPatch = z.object({
  minimum_orders: z.number().int().min(0).max(100000).optional(),
  minimum_rating: z.number().min(0).max(5).optional(),
  minimum_response_rate: z.number().min(0).max(100).optional(),
  maximum_cancellation_rate: z.number().min(0).max(100).optional(),
  maximum_dispute_rate: z.number().min(0).max(100).optional(),
  minimum_success_score: z.number().min(0).max(100).optional(),
  minimum_account_age_days: z.number().int().min(0).max(100000).optional(),
  minimum_reviews: z.number().int().min(0).max(100000).optional(),
  manual_review_required: z.boolean().optional(), is_active: z.boolean().optional(),
  label: z.string().trim().min(1).max(100).optional(),
}).strict();
const adminSchemas: Record<string, z.ZodType> = {
  "admin-overview": z.object({ action: z.literal("admin-overview") }).strict(),
  "admin-update-requirement": z.object({ action: z.string(), id: uuid, patch: requirementPatch }).strict(),
  "admin-adjust-rewards": z.object({ action: z.string(), user_id: uuid, points: z.number().int().min(-100000).max(100000).default(0), xp: z.number().int().min(-100000).max(100000).default(0), reason: reasonSchema }).strict(),
  "admin-grant-top": z.object({ action: z.string(), seller_id: uuid, mode: z.enum(["granted", "rejected", "auto"]).optional(), approve: z.boolean().optional(), reason: reasonSchema }).strict(),
  "admin-award-badge": z.object({ action: z.string(), user_id: uuid, code: z.string().min(1).max(100) }).strict(),
  "admin-revoke-badge": z.object({ action: z.string(), user_id: uuid, code: z.string().min(1).max(100) }).strict(),
  "admin-flag-action": z.object({ action: z.string(), flag_id: uuid, decision: z.enum(["warn", "suspend", "dismiss"]), reason: reasonSchema }).strict(),
  "admin-unsuspend": z.object({ action: z.string(), seller_id: uuid, reason: reasonSchema }).strict(),
  "admin-recalculate-seller": z.object({ action: z.string(), seller_id: uuid }).strict(),
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BOOST_POINTS_COST = 200;
const BOOST_HOURS = 72;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id ?? null;
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const { data: adminRows } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  const isAdmin = (adminRows ?? []).length > 0;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = String(body.action ?? "");
  if (action.startsWith("admin-")) {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    const schema = adminSchemas[action];
    if (!schema) return json({ error: "Action inconnue" }, 400);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return json({ error: "Paramètres administrateur invalides", details: parsed.error.flatten() }, 400);
    body = parsed.data as Record<string, unknown>;
  }

  try {
    switch (action) {
      case "get-seller-dashboard": {
        const level = await calculateSellerLevel(admin, userId);
        await trackMissionMetric(admin, userId, "dashboard_visit", 1, "seller");
        const [rewards, badges, missions, boosts, club, reviews] = await Promise.all([
          admin.from("user_rewards").select("*").eq("user_id", userId).maybeSingle(),
          admin.from("user_badges").select("awarded_at, badges(code,name,description)").eq("user_id", userId),
          admin.from("user_missions").select("*, missions(*)").eq("user_id", userId).neq("status", "expired"),
          admin.from("seller_boosts").select("*").eq("seller_id", userId).order("created_at", { ascending: false }).limit(10),
          admin.from("sellfy_club_memberships").select("*").eq("seller_id", userId).eq("is_active", true).maybeSingle(),
          admin.from("seller_reviews").select("rating, comment, created_at").eq("seller_id", userId).order("created_at", { ascending: false }).limit(10),
        ]);
        const { data: allMissions } = await admin.from("missions").select("*").eq("audience", "seller").eq("is_active", true);
        return json({
          level: { ...level, label: LEVEL_LABELS[level.level] },
          rewards: rewards.data ?? { points_balance: 0, xp_total: 0, points_lifetime: 0, buyer_level: 0, orders_placed: 0 },
          badges: badges.data ?? [],
          missions: missions.data ?? [],
          catalogue: (allMissions ?? []).map((m) => ({ ...m, period_key: periodKey(m.period as string) })),
          boosts: boosts.data ?? [],
          club: club.data ?? null,
          reviews: reviews.data ?? [],
          boost_cost_points: BOOST_POINTS_COST,
        });
      }

      case "get-buyer-dashboard": {
        await recomputeBuyerLevel(admin, userId);
        const [rewards, badges, missions, purchases, points] = await Promise.all([
          admin.from("user_rewards").select("*").eq("user_id", userId).maybeSingle(),
          admin.from("user_badges").select("awarded_at, badges(code,name,description)").eq("user_id", userId),
          admin.from("user_missions").select("*, missions(*)").eq("user_id", userId),
          admin.from("purchases").select("id, product_title, amount, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
          admin.from("points_transactions").select("amount, reason, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
        ]);
        const { data: buyerMissions } = await admin.from("missions").select("*").eq("audience", "buyer").eq("is_active", true);
        return json({
          rewards: rewards.data ?? { points_balance: 0, xp_total: 0, points_lifetime: 0, buyer_level: 0, orders_placed: 0 },
          badges: badges.data ?? [],
          missions: (missions.data ?? []).filter((m) => (m as Record<string, any>).missions?.audience === "buyer"),
          catalogue: buyerMissions ?? [],
          purchases: purchases.data ?? [],
          points_history: points.data ?? [],
        });
      }

      case "recalculate": {
        const result = await calculateSellerLevel(admin, userId);
        return json({ level: result });
      }

      case "claim-mission": {
        const id = String(body.user_mission_id ?? "");
        if (!id) return json({ error: "Mission manquante" }, 400);
        const result = await claimMission(admin, userId, id);
        if (result.error) return json({ error: result.error }, 400);
        return json(result);
      }

      case "create-boost": {
        const targetId = String(body.target_id ?? "").slice(0, 120);
        const targetLabel = String(body.target_label ?? "").slice(0, 160);
        const paidWith = body.paid_with === "pi" ? "pi" : "points";
        if (!targetId) return json({ error: "Produit ou service manquant" }, 400);

        if (paidWith === "points") {
          const { data: rewards } = await admin.from("user_rewards").select("points_balance").eq("user_id", userId).maybeSingle();
          if (Number(rewards?.points_balance ?? 0) < BOOST_POINTS_COST) {
            return json({ error: `Il vous faut ${BOOST_POINTS_COST} Sellfy Points pour ce Boost.` }, 400);
          }
          await awardPoints(admin, userId, -BOOST_POINTS_COST, "Sellfy Boost", "boost", `${targetId}:${Date.now()}`);
        } else {
          const paymentId = String(body.pi_payment_id ?? "");
          const { data: purchase } = await admin
            .from("purchases")
            .select("id,status,txid,user_id")
            .eq("payment_id", paymentId)
            .maybeSingle();
          if (!purchase || purchase.user_id !== userId || purchase.status !== "completed" || !purchase.txid) {
            return json({ error: "Paiement Pi non confirme pour ce Boost." }, 400);
          }
        }

        const { data: boost, error } = await admin
          .from("seller_boosts")
          .insert({
            seller_id: userId,
            target_type: String(body.target_type ?? "product"),
            target_id: targetId,
            target_label: targetLabel,
            paid_with: paidWith,
            points_spent: paidWith === "points" ? BOOST_POINTS_COST : 0,
            pi_amount: paidWith === "pi" ? Number(body.pi_amount ?? 0) : 0,
            pi_payment_id: paidWith === "pi" ? String(body.pi_payment_id ?? "") : null,
            ends_at: new Date(Date.now() + BOOST_HOURS * 3600_000).toISOString(),
          })
          .select("*")
          .maybeSingle();
        if (error) return json({ error: "Le Boost n'a pas pu etre cree." }, 500);
        await admin.from("reward_audit_logs").insert({ user_id: userId, action: "boost_created", details: { targetId, paidWith } });
        return json({ boost });
      }

      case "join-club": {
        const tier = body.tier === "pro" ? "pro" : "standard";
        const benefits = tier === "pro"
          ? ["Analytics avances", "Outils marketing supplementaires", "Support prioritaire", "Fonctionnalites avancees", "Acces anticipe"]
          : ["Analytics avances", "Coupons", "Outils promotionnels", "Statistiques", "Outils de croissance"];
        const subscriptionId = body.subscription_id ? String(body.subscription_id) : null;
        if (subscriptionId) {
          const { data: sub } = await admin.from("subscriptions").select("id,subscriber_id,status").eq("id", subscriptionId).maybeSingle();
          if (!sub || sub.subscriber_id !== userId || sub.status !== "active") {
            return json({ error: "Abonnement Sellfy Club non valide." }, 400);
          }
        }
        await admin.from("sellfy_club_memberships").insert({
          seller_id: userId, tier, subscription_id: subscriptionId, benefits, is_active: true,
        });
        // Reminder: the Club never changes the seller's level.
        await admin.from("reward_audit_logs").insert({ user_id: userId, action: "club_joined", details: { tier } });
        return json({ ok: true, tier, benefits });
      }

      case "leave-club": {
        await admin.from("sellfy_club_memberships").update({ is_active: false, ends_at: new Date().toISOString() }).eq("seller_id", userId).eq("is_active", true);
        return json({ ok: true });
      }

      // ===== ADMIN =====
      case "admin-overview": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const [requirements, levels, flags, badges, userBadges, rewards, profiles, moderation, pointsTx, xpTx, audit] = await Promise.all([
          admin.from("seller_level_requirements").select("*").order("level"),
          admin.from("seller_levels").select("*").order("calculated_at", { ascending: false }).limit(500),
          admin.from("reward_fraud_flags").select("*").order("created_at", { ascending: false }).limit(200),
          admin.from("badges").select("*").order("code"),
          admin.from("user_badges").select("user_id, awarded_at, badges(code,name)"),
          admin.from("user_rewards").select("user_id, points_balance, xp_total"),
          admin.from("profiles").select("id, pi_username"),
          admin.from("seller_moderation").select("*"),
          admin.from("points_transactions").select("*").eq("source_type", "admin").order("created_at", { ascending: false }).limit(100),
          admin.from("xp_transactions").select("*").eq("source_type", "admin").order("created_at", { ascending: false }).limit(100),
          admin.from("reward_audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
        ]);
        for (const result of [requirements, levels, flags, badges, userBadges, rewards, profiles, moderation, pointsTx, xpTx, audit]) {
          if (result.error) throw result.error;
        }
        const { data: perf } = await admin.from("seller_performance").select("seller_id, success_score");
        const nameOf = new Map((profiles.data ?? []).map((p) => [p.id, p.pi_username]));
        const rewardOf = new Map((rewards.data ?? []).map((r) => [r.user_id, r]));
        const modOf = new Map((moderation.data ?? []).map((m) => [m.seller_id, m]));
        const perfOf = new Map((perf ?? []).map((p) => [p.seller_id, p.success_score]));
        const openFlag = new Set((flags.data ?? []).filter((f) => !f.resolved && f.user_id).map((f) => f.user_id));
        const sellers = (levels.data ?? []).map((l) => {
          const m = modOf.get(l.seller_id);
          const status = m?.suspended ? "suspended" : openFlag.has(l.seller_id) ? "flagged" : l.pending_manual_review ? "pending" : "active";
          return {
            ...l,
            pi_username: nameOf.get(l.seller_id) ?? null,
            points_balance: rewardOf.get(l.seller_id)?.points_balance ?? 0,
            xp_total: rewardOf.get(l.seller_id)?.xp_total ?? 0,
            success_score: perfOf.get(l.seller_id) ?? 0,
            warnings_count: m?.warnings_count ?? 0,
            status,
            badges: (userBadges.data ?? []).filter((b) => b.user_id === l.seller_id),
          };
        });
        // Points + XP admin adjustment history, with the admin responsible (from the audit log).
        const adjAudit = (audit.data ?? []).filter((a) => a.action === "admin_adjustment");
        const adjustments = adjAudit.map((a) => ({
          id: a.id,
          created_at: a.created_at,
          user_id: a.user_id,
          user_name: nameOf.get(a.user_id) ?? null,
          actor_name: nameOf.get(a.actor_id) ?? a.actor_id,
          points: (a.details as any)?.points ?? 0,
          xp: (a.details as any)?.xp ?? 0,
          reason: (a.details as any)?.reason ?? "",
        }));
        return json({
          requirements: requirements.data ?? [],
          sellers,
          fraud_flags: (flags.data ?? []).map((f) => ({ ...f, user_name: nameOf.get(f.user_id) ?? null })),
          badges: badges.data ?? [],
          adjustments,
          audit: (audit.data ?? []).map((a) => ({ ...a, user_name: nameOf.get(a.user_id) ?? null, actor_name: nameOf.get(a.actor_id) ?? null })),
          points_tx: pointsTx.data ?? [],
          xp_tx: xpTx.data ?? [],
        });
      }

      case "admin-revoke-badge": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const target = String(body.user_id ?? "");
        const code = String(body.code ?? "");
        if (!target || !code) return json({ error: "Donnees manquantes" }, 400);
        const { data: badge } = await admin.from("badges").select("id").eq("code", code).maybeSingle();
        if (!badge) return json({ error: "Badge inconnu" }, 404);
        const { error } = await admin.from("user_badges").delete().eq("user_id", target).eq("badge_id", badge.id);
        if (error) return json({ error: error.message }, 500);
        await admin.from("reward_audit_logs").insert({ user_id: target, actor_id: userId, action: "badge_revoked", details: { code } });
        return json({ ok: true });
      }

      case "admin-flag-action": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const flagId = String(body.flag_id ?? "");
        const decision = String(body.decision ?? "");
        const reason = String(body.reason ?? "").trim().slice(0, 300);
        if (!flagId || !["warn", "suspend", "dismiss"].includes(decision)) return json({ error: "Action invalide" }, 400);
        if (!reason) return json({ error: "Une raison est obligatoire" }, 400);
        const { data: flag } = await admin.from("reward_fraud_flags").select("*").eq("id", flagId).maybeSingle();
        if (!flag) return json({ error: "Signalement introuvable" }, 404);
        if (flag.resolved) return json({ error: "Signalement deja traite" }, 400);
        const now = new Date().toISOString();
        if (flag.user_id && decision !== "dismiss") {
          const { data: mod } = await admin.from("seller_moderation").select("*").eq("seller_id", flag.user_id).maybeSingle();
          const row: Record<string, unknown> = { seller_id: flag.user_id, warnings_count: mod?.warnings_count ?? 0 };
          if (decision === "warn") { row.warnings_count = Number(mod?.warnings_count ?? 0) + 1; row.last_warning_at = now; }
          if (decision === "suspend") { row.suspended = true; row.suspended_at = now; row.suspended_by = userId; row.suspension_reason = reason; }
          await admin.from("seller_moderation").upsert(row, { onConflict: "seller_id" });
        }
        await admin.from("reward_fraud_flags").update({ resolved: true, resolution: decision, resolved_by: userId, resolved_at: now }).eq("id", flagId);
        await admin.from("reward_audit_logs").insert({
          user_id: flag.user_id, actor_id: userId,
          action: decision === "warn" ? "seller_warned" : decision === "suspend" ? "seller_suspended" : "flag_dismissed",
          details: { flag_id: flagId, reason },
        });
        return json({ ok: true });
      }

      case "admin-unsuspend": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const target = String(body.seller_id ?? "");
        const reason = String(body.reason ?? "").trim().slice(0, 300);
        if (!target || !reason) return json({ error: "Vendeur et raison obligatoires" }, 400);
        await admin.from("seller_moderation").update({ suspended: false, suspended_at: null, suspended_by: null, suspension_reason: null }).eq("seller_id", target);
        await admin.from("reward_audit_logs").insert({ user_id: target, actor_id: userId, action: "seller_unsuspended", details: { reason } });
        return json({ ok: true });
      }

      case "admin-update-requirement": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const id = String(body.id ?? "");
        const patch = (body.patch ?? {}) as Record<string, unknown>;
        const allowed = [
          "minimum_orders", "minimum_rating", "minimum_response_rate", "maximum_cancellation_rate",
          "maximum_dispute_rate", "minimum_success_score", "minimum_account_age_days", "minimum_reviews",
          "manual_review_required", "is_active", "label",
        ];
        const clean: Record<string, unknown> = {};
        for (const key of allowed) if (key in patch) clean[key] = patch[key];
        if (!id || Object.keys(clean).length === 0) return json({ error: "Rien a mettre a jour" }, 400);
        const { data: requirement, error: lookupError } = await admin.from("seller_level_requirements").select("level").eq("id", id).maybeSingle();
        if (lookupError) throw lookupError;
        if (!requirement) return json({ error: "Niveau introuvable" }, 404);
        if (requirement.level === "level_3" && clean.manual_review_required === false) return json({ error: "Sellfy Top nécessite une validation manuelle." }, 400);
        const { error } = await admin.from("seller_level_requirements").update(clean).eq("id", id);
        if (error) return json({ error: error.message }, 500);
        await admin.from("reward_audit_logs").insert({ actor_id: userId, action: "requirement_updated", details: { id, clean } });
        return json({ ok: true });
      }

      case "admin-adjust-rewards": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const target = String(body.user_id ?? "");
        const points = Number(body.points ?? 0);
        const xp = Number(body.xp ?? 0);
        const reason = String(body.reason ?? "Ajustement administrateur").slice(0, 200);
        if (!target) return json({ error: "Utilisateur manquant" }, 400);
        if (!points && !xp) return json({ error: "Indiquez un ajustement non nul." }, 400);
        const { data: targetProfile } = await admin.from("profiles").select("id").eq("id", target).maybeSingle();
        if (!targetProfile) return json({ error: "Utilisateur introuvable" }, 404);
        const { data: balance } = await admin.from("user_rewards").select("points_balance,xp_total").eq("user_id", target).maybeSingle();
        if (Number(balance?.points_balance ?? 0) + points < 0 || Number(balance?.xp_total ?? 0) + xp < 0) return json({ error: "L’ajustement rendrait le solde négatif." }, 400);
        const ref = `admin:${Date.now()}`;
        if (points) { const result = await awardPoints(admin, target, points, reason, "admin", ref); if (result.skipped) throw new Error("Points adjustment failed"); }
        if (xp) { const result = await awardXp(admin, target, xp, reason, "admin", ref); if (result.skipped) throw new Error("XP adjustment failed"); }
        await admin.from("reward_audit_logs").insert({ user_id: target, actor_id: userId, action: "admin_adjustment", details: { points, xp, reason } });
        return json({ ok: true });
      }

      case "admin-grant-top": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const target = String(body.seller_id ?? "");
        const mode = String(body.mode ?? (body.approve === false ? "rejected" : "granted"));
        if (!target || !["granted", "rejected", "auto"].includes(mode)) return json({ error: "Donnees invalides" }, 400);
        const { data: row } = await admin.from("seller_levels").select("*").eq("seller_id", target).maybeSingle();
        if (!row) return json({ error: "Vendeur introuvable" }, 404);
        const now = new Date().toISOString();
        if (mode === "granted") {
          await admin.from("seller_levels").update({
            level: "level_3", pending_manual_review: false, level_since: now,
            top_override: "granted", top_override_by: userId, top_override_at: now,
          }).eq("seller_id", target);
          await awardBadge(admin, target, "top_seller");
        } else if (mode === "rejected") {
          await admin.from("seller_levels").update({
            pending_manual_review: false,
            level: row.level === "level_3" ? "level_2" : row.level,
            top_override: "rejected", top_override_by: userId, top_override_at: now,
          }).eq("seller_id", target);
        } else {
          await admin.from("seller_levels").update({ top_override: null, top_override_by: null, top_override_at: null }).eq("seller_id", target);
          await calculateSellerLevel(admin, target);
        }
        await admin.from("reward_audit_logs").insert({
          user_id: target, actor_id: userId,
          action: mode === "granted" ? "top_granted" : mode === "rejected" ? "top_rejected" : "top_override_cleared",
          details: { reason: String(body.reason ?? "").slice(0, 300) },
        });
        return json({ ok: true });
      }

      case "admin-award-badge": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const target = String(body.user_id ?? "");
        const code = String(body.code ?? "");
        if (!target || !code) return json({ error: "Donnees manquantes" }, 400);
        const ok = await awardBadge(admin, target, code);
        if (!ok) return json({ error: "Badge inconnu ou attribution impossible" }, 400);
        await admin.from("reward_audit_logs").insert({ user_id: target, actor_id: userId, action: "admin_badge_awarded", details: { code } });
        return json({ ok });
      }

      case "admin-recalculate-seller": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const target = String(body.seller_id ?? "");
        if (!target) return json({ error: "Vendeur manquant" }, 400);
        const result = await calculateSellerLevel(admin, target);
        return json({ level: result });
      }

      default:
        return json({ error: `Action inconnue: ${action}` }, 400);
    }
  } catch (err) {
    console.error("sellfy-rewards error", err);
    return json({ error: "Une erreur est survenue" }, 500);
  }
});
