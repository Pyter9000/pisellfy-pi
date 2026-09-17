import { useEffect, useState } from "react";
import { Award, Gift, Loader2, Sparkles } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/sections/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePiAuth } from "@/hooks/usePiAuth";
import { toast } from "@/hooks/use-toast";
import { claimMission, getBuyerDashboard, type BadgeRow, type MissionRow, type RewardsRow } from "@/lib/rewards/api";

interface Dashboard {
  rewards: RewardsRow;
  badges: BadgeRow[];
  missions: MissionRow[];
  purchases: { id: string; product_title: string; amount: number; status: string; created_at: string }[];
  points_history: { amount: number; reason: string; created_at: string }[];
}

const REWARD_STEP = 500;

const BuyerRewards = () => {
  const { session, signIn } = usePiAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await getBuyerDashboard());
    } catch (err) {
      toast({
        title: "Chargement impossible",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-32 pb-20 text-center space-y-4">
          <h1 className="font-display text-3xl font-bold text-foreground">Mes recompenses</h1>
          <p className="text-muted-foreground">Connectez-vous avec Pi pour voir vos Points, votre XP et vos badges.</p>
          <Button onClick={signIn}>Se connecter avec Pi</Button>
        </main>
        <Footer />
      </div>
    );
  }

  const points = data?.rewards.points_balance ?? 0;
  const remaining = REWARD_STEP - (points % REWARD_STEP);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-28 pb-20 space-y-6">
        <h1 className="font-display text-3xl font-bold text-foreground">Mes recompenses Sellfy</h1>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
          </div>
        )}

        {data && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              {[
                ["Sellfy Points", points],
                ["XP", data.rewards.xp_total],
                ["Buyer Level", data.rewards.buyer_level],
                ["Commandes", data.rewards.orders_placed],
              ].map(([label, value]) => (
                <div key={String(label)} className="glass rounded-2xl border border-border p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-3xl font-bold text-foreground">{String(value)}</p>
                </div>
              ))}
            </div>

            <section className="glass rounded-2xl border border-border p-5">
              <h2 className="flex items-center gap-2 font-display font-semibold text-lg text-foreground mb-3">
                <Gift className="w-4 h-4 text-primary" /> Prochaine recompense
              </h2>
              <p className="text-sm text-muted-foreground mb-2">
                Encore {remaining} Points pour debloquer votre prochaine recompense.
              </p>
              <Progress value={((points % REWARD_STEP) / REWARD_STEP) * 100} className="h-2" />
            </section>

            <section className="glass rounded-2xl border border-border p-5">
              <h2 className="flex items-center gap-2 font-display font-semibold text-lg text-foreground mb-3">
                <Award className="w-4 h-4 text-primary" /> Badges
              </h2>
              {data.badges.length === 0 ? (
                <p className="text-sm text-muted-foreground">Passez votre premiere commande pour obtenir un badge.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.badges.map((b) => (
                    <Badge key={b.badges?.code} variant="secondary" title={b.badges?.description}>
                      {b.badges?.name}
                    </Badge>
                  ))}
                </div>
              )}
            </section>

            <section className="glass rounded-2xl border border-border p-5">
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">Missions</h2>
              <div className="space-y-3">
                {data.missions.length === 0 && (
                  <p className="text-sm text-muted-foreground">Vos missions apparaissent au fil de vos achats.</p>
                )}
                {data.missions.map((m) => {
                  const target = m.missions?.target ?? 1;
                  return (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div>
                        <p className="font-medium text-foreground">{m.missions?.title}</p>
                        <p className="text-sm text-muted-foreground">{m.missions?.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.progress}/{target} · +{m.missions?.reward_points} Points, +{m.missions?.reward_xp} XP
                        </p>
                      </div>
                      {m.status === "claimed" ? (
                        <Badge variant="secondary">Recompense recue</Badge>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy || m.status !== "completed"}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await claimMission(m.id);
                              toast({ title: "Recompense reclamee" });
                              await load();
                            } catch (err) {
                              toast({
                                title: "Action impossible",
                                description: err instanceof Error ? err.message : String(err),
                                variant: "destructive",
                              });
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Reclamer
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="glass rounded-2xl border border-border p-5">
              <h2 className="flex items-center gap-2 font-display font-semibold text-lg text-foreground mb-3">
                <Sparkles className="w-4 h-4 text-primary" /> Historique des Points
              </h2>
              {data.points_history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun mouvement pour l'instant.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {data.points_history.map((p, i) => (
                    <div key={i} className="flex justify-between border-b border-border pb-1">
                      <span className="text-muted-foreground">{p.reason}</span>
                      <span className={p.amount >= 0 ? "text-primary" : "text-destructive"}>
                        {p.amount >= 0 ? "+" : ""}{p.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="glass rounded-2xl border border-border p-5">
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">Mes commandes</h2>
              {data.purchases.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune commande.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {data.purchases.map((p) => (
                    <div key={p.id} className="flex justify-between border-b border-border pb-1">
                      <span className="text-foreground">{p.product_title}</span>
                      <span className="text-muted-foreground">{p.amount} π · {p.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default BuyerRewards;
