// Sellfy Levels & Rewards API.
// Every read/write goes through the authenticated caller's own identity.
// The client can never declare a level, a score, a points balance or a badge.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
        const [requirements, levels, flags, badges, missions, boosts, clubs, audit] = await Promise.all([
          admin.from("seller_level_requirements").select("*").order("level"),
          admin.from("seller_levels").select("*, seller_performance:seller_performance(success_score)").order("calculated_at", { ascending: false }).limit(100),
          admin.from("reward_fraud_flags").select("*").order("created_at", { ascending: false }).limit(50),
          admin.from("badges").select("*").order("code"),
          admin.from("missions").select("*").order("period"),
          admin.from("seller_boosts").select("*").order("created_at", { ascending: false }).limit(50),
          admin.from("sellfy_club_memberships").select("*").eq("is_active", true),
          admin.from("reward_audit_logs").select("*").order("created_at", { ascending: false }).limit(50),
        ]);
        return json({
          requirements: requirements.data ?? [],
          levels: levels.data ?? [],
          fraud_flags: flags.data ?? [],
          badges: badges.data ?? [],
          missions: missions.data ?? [],
          boosts: boosts.data ?? [],
          clubs: clubs.data ?? [],
          audit: audit.data ?? [],
        });
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
        const ref = `admin:${Date.now()}`;
        if (points) await awardPoints(admin, target, points, reason, "admin", ref);
        if (xp) await awardXp(admin, target, xp, reason, "admin", ref);
        await admin.from("reward_audit_logs").insert({ user_id: target, actor_id: userId, action: "admin_adjustment", details: { points, xp, reason } });
        return json({ ok: true });
      }

      case "admin-grant-top": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const target = String(body.seller_id ?? "");
        const approve = body.approve !== false;
        if (!target) return json({ error: "Vendeur manquant" }, 400);
        const { data: row } = await admin.from("seller_levels").select("*").eq("seller_id", target).maybeSingle();
        if (!row?.pending_manual_review) return json({ error: "Ce vendeur n'est pas eligible au niveau Top." }, 400);
        if (approve) {
          await admin.from("seller_levels").update({
            level: "level_3", pending_manual_review: false, level_since: new Date().toISOString(),
          }).eq("seller_id", target);
          await awardBadge(admin, target, "top_seller");
        } else {
          await admin.from("seller_levels").update({ pending_manual_review: false }).eq("seller_id", target);
        }
        await admin.from("reward_audit_logs").insert({ user_id: target, actor_id: userId, action: approve ? "top_granted" : "top_rejected", details: {} });
        return json({ ok: true });
      }

      case "admin-award-badge": {
        if (!isAdmin) return json({ error: "Forbidden" }, 403);
        const target = String(body.user_id ?? "");
        const code = String(body.code ?? "");
        if (!target || !code) return json({ error: "Donnees manquantes" }, 400);
        const ok = await awardBadge(admin, target, code);
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
