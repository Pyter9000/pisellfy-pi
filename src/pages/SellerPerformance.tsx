import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Award,
  Check,
  Crown,
  Loader2,
  RefreshCw,
  Rocket,
  Sparkles,
  Star,
  Target,
  X,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/sections/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import LevelBadge from "@/components/rewards/LevelBadge";
import { usePiAuth } from "@/hooks/usePiAuth";
import { toast } from "@/hooks/use-toast";
import {
  claimMission,
  createBoost,
  fmtNumber,
  getSellerDashboard,
  joinClub,
  leaveClub,
  recalculateMyLevel,
  type BadgeRow,
  type BoostRow,
  type Criterion,
  type LevelPayload,
  type MissionRow,
  type RewardsRow,
} from "@/lib/rewards/api";

interface Dashboard {
  level: LevelPayload;
  rewards: RewardsRow;
  badges: BadgeRow[];
  missions: MissionRow[];
  boosts: BoostRow[];
  club: { tier: string; benefits: string[]; is_active: boolean } | null;
  reviews: { rating: number; comment: string; created_at: string }[];
  boost_cost_points: number;
}

const Card = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <section className="glass rounded-2xl p-5 border border-border">
    <h2 className="flex items-center gap-2 font-display font-semibold text-lg text-foreground mb-4">
      {icon}
      {title}
    </h2>
    {children}
  </section>
);

const CriterionRow = ({ c }: { c: Criterion }) => {
  const pct = c.direction === "min"
    ? c.target > 0 ? Math.min(100, (c.current / c.target) * 100) : 100
    : c.current <= c.target ? 100 : Math.max(0, (c.target / Math.max(c.current, 0.1)) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          {c.passed ? <Check className="w-4 h-4 text-primary" /> : <X className="w-4 h-4 text-destructive" />}
          {c.label}
        </span>
        <span className={c.passed ? "text-primary font-medium" : "text-foreground font-medium"}>
          {fmtNumber(c.current, c.unit)} / {fmtNumber(c.target, c.unit)}
          {c.direction === "max" ? " max" : ""}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
};

const SellerPerformance = () => {
  const { session, signIn } = usePiAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [boostTarget, setBoostTarget] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setData(await getSellerDashboard());
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

  const run = async (fn: () => Promise<unknown>, okMessage: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: okMessage });
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
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-32 pb-20 text-center space-y-4">
          <h1 className="font-display text-3xl font-bold text-foreground">Sellfy Levels</h1>
          <p className="text-muted-foreground">Connectez-vous avec Pi pour voir votre niveau et vos performances.</p>
          <Button onClick={signIn}>Se connecter avec Pi</Button>
        </main>
        <Footer />
      </div>
    );
  }

  const level = data?.level;
  const perf = (level?.performance ?? {}) as Record<string, number>;
  const rep = (level?.reputation ?? {}) as Record<string, number | boolean>;
  const metrics = (level?.metrics ?? {}) as Record<string, number>;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-28 pb-20 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold text-foreground">Ma performance Sellfy</h1>
            {level && <LevelBadge level={level.level} />}
          </div>
          <Button variant="outline" onClick={() => void run(recalculateMyLevel, "Niveau recalcule")} disabled={busy}>
            <RefreshCw className="w-4 h-4 mr-2" /> Recalculer
          </Button>
        </header>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement...
          </div>
        )}

        {level?.under_watch && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground flex gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
            <span>
              {level.downgrade_warning ??
                "Votre niveau est sous surveillance. Vous risquez de perdre votre niveau si vos performances continuent de diminuer."}
            </span>
          </div>
        )}

        {level?.pending_manual_review && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-foreground flex gap-2">
            <Crown className="w-4 h-4 text-primary mt-0.5" />
            Vous etes eligible au niveau Sellfy Top. Une verification Sellfy est necessaire avant l'attribution.
          </div>
        )}

        {data && level && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card title="Performance Score" icon={<Target className="w-4 h-4 text-primary" />}>
                <p className="text-4xl font-bold text-foreground">{perf.success_score ?? 0}<span className="text-lg text-muted-foreground">/100</span></p>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <p>Qualite {perf.quality_score}/100 · Fiabilite {perf.reliability_score}/100</p>
                  <p>Communication {perf.communication_score}/100 · Reactivite {perf.response_score}/100</p>
                  <p>Annulations {perf.cancellation_rate}% · Litiges {perf.dispute_rate}%</p>
                  {!perf.data_sufficient && <p className="text-xs">Donnees insuffisantes : score encore neutre.</p>}
                </div>
              </Card>

              <Card title="Reputation" icon={<Star className="w-4 h-4 text-primary" />}>
                <p className="text-4xl font-bold text-foreground">⭐ {String(rep.reputation_score ?? 0)}<span className="text-lg text-muted-foreground">/100</span></p>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <p>⭐ {String(rep.public_rating ?? 0)} · ✓ {String(rep.public_orders_completed ?? 0)} commandes terminees</p>
                  {rep.fast_responder ? <p>✓ Reponse rapide</p> : null}
                  {rep.reliable_seller ? <p>✓ Vendeur fiable</p> : null}
                </div>
              </Card>

              <Card title="Points & XP" icon={<Sparkles className="w-4 h-4 text-primary" />}>
                <p className="text-3xl font-bold text-foreground">{data.rewards.points_balance} Points</p>
                <p className="text-sm text-muted-foreground mt-1">XP total : {data.rewards.xp_total}</p>
                <p className="text-sm text-muted-foreground">Points cumules : {data.rewards.points_lifetime}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Les Points et l'XP n'achetent jamais un niveau : seule la performance reelle compte.
                </p>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Pourquoi suis-je a ce niveau ?">
                <div className="space-y-3">
                  {level.progress.current.criteria.map((c) => (
                    <CriterionRow key={c.key} c={c} />
                  ))}
                </div>
              </Card>

              <Card title={level.progress.next ? `Pour passer a ${level.progress.next.label}` : "Niveau maximum atteint"}>
                <div className="space-y-3">
                  {(level.progress.next?.criteria ?? []).map((c) => (
                    <CriterionRow key={c.key} c={c} />
                  ))}
                </div>
                {level.next_best_actions.length > 0 && (
                  <div className="mt-5">
                    <h3 className="text-sm font-semibold text-foreground mb-2">Que faire maintenant ?</h3>
                    <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
                      {level.next_best_actions.map((a) => <li key={a}>{a}</li>)}
                    </ol>
                  </div>
                )}
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                ["Commandes terminees", metrics.ordersCompleted],
                ["Evaluations", metrics.reviewsCount],
                ["Taux de reponse", `${metrics.responseRate}%`],
                ["Litiges", metrics.disputesCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="glass rounded-2xl border border-border p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold text-foreground">{String(value ?? 0)}</p>
                </div>
              ))}
            </div>

            <Card title="Badges" icon={<Award className="w-4 h-4 text-primary" />}>
              {data.badges.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun badge pour l'instant. Terminez votre premiere vente.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.badges.map((b) => (
                    <Badge key={b.badges?.code} variant="secondary" title={b.badges?.description}>
                      {b.badges?.name}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Missions">
              <div className="space-y-3">
                {data.missions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Vos missions apparaissent des que vous agissez sur la marketplace.
                  </p>
                )}
                {data.missions.map((m) => {
                  const target = m.missions?.target ?? 1;
                  return (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div className="min-w-[200px]">
                        <p className="font-medium text-foreground">{m.missions?.title}</p>
                        <p className="text-sm text-muted-foreground">{m.missions?.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {m.missions?.period} · {m.progress}/{target} · +{m.missions?.reward_points} Points, +{m.missions?.reward_xp} XP
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={Math.min(100, (m.progress / Math.max(1, target)) * 100)} className="h-1.5 w-24" />
                        {m.status === "claimed" ? (
                          <Badge variant="secondary">Recompense recue</Badge>
                        ) : (
                          <Button
                            size="sm"
                            disabled={busy || m.status !== "completed"}
                            onClick={() => void run(() => claimMission(m.id), "Recompense reclamee")}
                          >
                            Reclamer
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Sellfy Boost" icon={<Rocket className="w-4 h-4 text-primary" />}>
              <p className="text-sm text-muted-foreground mb-3">
                Promotion payante de 72 h pour {data.boost_cost_points} Sellfy Points. Un Boost ameliore la visibilite,
                il ne garantit ni classement ni ventes.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={boostTarget}
                  onChange={(e) => setBoostTarget(e.target.value)}
                  placeholder="Nom du produit ou service a promouvoir"
                  className="max-w-xs"
                />
                <Button
                  disabled={busy || !boostTarget.trim()}
                  onClick={() =>
                    void run(
                      () => createBoost({ target_id: boostTarget.trim(), target_label: boostTarget.trim(), paid_with: "points" }),
                      "Boost active",
                    )
                  }
                >
                  Activer avec des Points
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {data.boosts.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-sm rounded-lg border border-border p-2">
                    <span className="text-foreground">{b.target_label || b.target_id}</span>
                    <span className="text-muted-foreground">
                      {b.status} · fin {new Date(b.ends_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Sellfy Club">
              <p className="text-sm text-muted-foreground mb-3">
                Le Club donne des outils de croissance. Il n'augmente jamais votre niveau vendeur.
              </p>
              {data.club ? (
                <div className="space-y-3">
                  <Badge>{data.club.tier === "pro" ? "Club PRO" : "Club STANDARD"}</Badge>
                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                    {(data.club.benefits ?? []).map((b) => <li key={b}>{b}</li>)}
                  </ul>
                  <Button variant="outline" disabled={busy} onClick={() => void run(leaveClub, "Club quitte")}>
                    Quitter le Club
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border p-4">
                    <p className="font-semibold text-foreground">STANDARD</p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside my-2">
                      <li>Analytics avances</li><li>Coupons</li><li>Outils promotionnels</li><li>Statistiques</li>
                    </ul>
                    <Button size="sm" disabled={busy} onClick={() => void run(() => joinClub("standard"), "Club STANDARD rejoint")}>
                      Rejoindre
                    </Button>
                  </div>
                  <div className="rounded-xl border border-primary/40 p-4">
                    <p className="font-semibold text-foreground">PRO</p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside my-2">
                      <li>Tout STANDARD</li><li>Outils marketing</li><li>Support prioritaire</li><li>Acces anticipe</li>
                    </ul>
                    <Button size="sm" disabled={busy} onClick={() => void run(() => joinClub("pro"), "Club PRO rejoint")}>
                      Rejoindre
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Dernieres evaluations">
              {data.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune evaluation pour l'instant.</p>
              ) : (
                <div className="space-y-2">
                  {data.reviews.map((r, i) => (
                    <div key={i} className="rounded-lg border border-border p-3 text-sm">
                      <p className="text-primary">{"★".repeat(r.rating)}</p>
                      <p className="text-muted-foreground">{r.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default SellerPerformance;
