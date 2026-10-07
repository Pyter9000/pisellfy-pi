import { describe, it, expect, vi, afterEach } from "vitest";
import { calculateSellerLevel, onPurchaseCompleted, computePerformance, type LevelRequirement, type SellerMetrics } from "../../supabase/functions/_shared/sellfyLevels";

// In-memory Data API double: no production records or Pi transactions are created.
function database(tables: Record<string, any[]> = {}) {
  const db = {
    tables,
    from(table: string) {
      tables[table] ??= [];
      let filters: ((row: any) => boolean)[] = [];
      let kind = "read";
      let payload: any;
      let options: any = {};
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        gte: () => query,
        neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return query; },
        insert: (value: unknown) => {kind = "insert"; payload = value; return query;},
        upsert: (value: unknown, opts: unknown) => {kind = "upsert"; payload = value; options = opts ?? {}; return query;},
        update: (value: unknown) => {kind = "update"; payload = value; return query;},
        maybeSingle: async () => {const result = await execute(); return {...result, data: result.data[0] ?? null};},
        then: (resolve: any, reject: any) => execute().then(resolve, reject),
      };
      async function execute() {
        const rows = tables[table];
        if (kind === "update") rows.filter(row => filters.every(fn => fn(row))).forEach(row => Object.assign(row,payload));
        if (kind === "insert" || kind === "upsert") {
          const keys = String(options.onConflict ?? "").split(",").filter(Boolean);
          const existing = keys.length ? rows.find(row => keys.every(key => row[key] === payload[key])) : undefined;
          if (existing) { if (!options.ignoreDuplicates) Object.assign(existing,payload); }
          else rows.push({points_balance:0, points_lifetime:0, xp_total:0, orders_placed:0, buyer_level:0, ...payload});
        }
        return {data: rows.filter(row => filters.every(fn => fn(row))), error: null};
      }
      return query;
    },
  };
  return db;
}
const requirement = (level: LevelRequirement["level"], orders: number, rating = 0, reviews = 0): LevelRequirement => ({
  level, label: level, minimum_orders: orders, minimum_rating: rating, minimum_reviews: reviews,
  minimum_response_rate: 80, maximum_cancellation_rate: 10, maximum_dispute_rate: 5,
  minimum_success_score: 60, minimum_account_age_days: 0, manual_review_required: level === "level_3", benefits: [], is_active: true,
});
function fixture(orders = 0) {
  return database({
    profiles: [{id:"seller",created_at:"2025-01-01"}],
    purchases: Array.from({length:orders}, (_,i) => ({id:`p${i}`,seller_id:"seller",user_id:"buyer",status:"completed",txid:`tx${i}`})),
    seller_reviews: Array.from({length:orders}, () => ({seller_id:"seller",rating:5})),
    seller_level_requirements: [requirement("level_0",0), requirement("level_1",5,4.4,3),requirement("level_2",20,4.7,10),requirement("level_3",75,4.8,30)],
    badges: ["first_sale","first_order","rising_seller","pro_seller","top_seller","fast_response","reliable_seller","top_rated"].map(code => ({id:code,code})),
  });
}
// The double intentionally implements the narrow API exercised by the real engine.
const client = (db: ReturnType<typeof database>) => db as unknown as Parameters<typeof calculateSellerLevel>[0];
afterEach(() => vi.useRealTimers());
describe("Sellfy seller engine", () => {
  it("starts a first seller at level 0 without badges", async () => {
    const db = fixture(); const result = await calculateSellerLevel(client(db),"seller");
    expect(result.level).toBe("level_0"); expect(result.performance.data_sufficient).toBe(false);
    expect(result.progress.next?.criteria.find(c => c.key === "orders")?.target).toBe(5);
    expect(db.tables.user_badges ?? []).toHaveLength(0);
  });
  it("rewards a first verified sale with points, XP and first-sale badge", async () => {
    const db = fixture(1);
    await onPurchaseCompleted(client(db),{id:"p0",seller_id:"seller",user_id:"buyer",amount:1,txid:"tx0"});
    expect(db.tables.user_rewards.find(r => r.user_id === "seller")).toMatchObject({points_balance:25,xp_total:40});
    expect(db.tables.user_badges.some(r => r.user_id === "seller" && r.badge_id === "first_sale")).toBe(true);
    expect(db.tables.seller_levels[0].level).toBe("level_0");
  });
  it("does not reward an unverified or self purchase", async () => {
    const db = fixture();
    await onPurchaseCompleted(client(db),{id:"p",seller_id:"seller",user_id:"buyer",amount:1,txid:null});
    await onPurchaseCompleted(client(db),{id:"p",seller_id:"seller",user_id:"seller",amount:1,txid:"tx"});
    expect(db.tables.user_rewards ?? []).toHaveLength(0); expect(db.tables.reward_fraud_flags[0].kind).toBe("self_purchase");
  });
  it("uses all configured criteria before granting Rising", async () => {
    const db = fixture(5); expect((await calculateSellerLevel(client(db),"seller")).level).toBe("level_1");
    const insufficient = fixture(4); expect((await calculateSellerLevel(client(insufficient),"seller")).level).toBe("level_0");
  });
  it("grants Pro but only marks Top eligible for manual review", async () => {
    expect((await calculateSellerLevel(client(fixture(20)),"seller")).level).toBe("level_2");
    const top = await calculateSellerLevel(client(fixture(75)),"seller");
    expect(top.level).toBe("level_2"); expect(top.eligible_level).toBe("level_3"); expect(top.pending_manual_review).toBe(true);
  });
  it("points and XP cannot buy a level", async () => {
    const db = fixture(); db.tables.user_rewards = [{user_id:"seller",points_balance:100000,xp_total:100000}];
    expect((await calculateSellerLevel(client(db),"seller")).level).toBe("level_0");
  });
  it("warns before downgrade, waits 14 days and drops one level", async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    const db = fixture(5); db.tables.seller_levels = [{seller_id:"seller",level:"level_2"}];
    let result = await calculateSellerLevel(client(db),"seller");
    expect(result.level).toBe("level_2");expect(result.under_watch).toBe(true);
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    expect((await calculateSellerLevel(client(db),"seller")).level).toBe("level_2");
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    result = await calculateSellerLevel(client(db),"seller");expect(result.level).toBe("level_1");expect(result.under_watch).toBe(false);
  });
  it("does not downgrade on insufficient data", async () => {
    const db = fixture(1);db.tables.seller_levels=[{seller_id:"seller",level:"level_2",watch_started_at:"2025-01-01"}];
    expect((await calculateSellerLevel(client(db),"seller")).level).toBe("level_2");
  });
  it("penalizes disputes regardless of sales volume", () => {
    const metrics: SellerMetrics={ordersCompleted:100,ordersCancelled:0,ordersTotal:100,reviewsCount:100,averageRating:5,disputesCount:0,responseRate:100,lateDeliveries:0,accountAgeDays:365};
    expect(computePerformance({...metrics,disputesCount:30}).success_score).toBeLessThan(computePerformance(metrics).success_score);
  });
});