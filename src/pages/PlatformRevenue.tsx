import { useEffect, useMemo, useState } from "react";
import { Loader2, Landmark, Users, ArrowDownToLine, ShieldAlert } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/sections/Footer";
import { Badge } from "@/components/ui/badge";
import { usePiAuth } from "@/hooks/usePiAuth";
import { toast } from "@/hooks/use-toast";
import {
  formatPi,
  isAdmin,
  listAllEarnings,
  listAllPayouts,
  PAYOUT_STATE_LABELS,
  TRANSACTION_LABELS,
  type Earning,
  type Payout,
} from "@/lib/revenue/api";

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

const PlatformRevenue = () => {
  const { session } = usePiAuth();
  const userId = session?.user?.id ?? null;
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    void (async () => {
      const admin = await isAdmin(userId);
      setAllowed(admin);
      if (!admin) {
        setLoading(false);
        return;
      }
      try {
        const [e, p] = await Promise.all([listAllEarnings(), listAllPayouts()]);
        setEarnings(e);
        setPayouts(p);
      } catch (err) {
        toast({
          title: "Chargement impossible",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const stats = useMemo(() => {
    const commissions = earnings.reduce((s, e) => s + e.platform_fee, 0);
    const owed = earnings
      .filter((e) => e.payout_status !== "paid")
      .reduce((s, e) => s + e.seller_earnings, 0);
    const gross = earnings.reduce((s, e) => s + e.total_amount, 0);
    return { commissions, owed, gross };
  }, [earnings]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-28 pb-20">
        <header className="mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">
            Revenus de la <span className="gradient-text">plateforme</span>
          </h1>
          <p className="text-muted-foreground">Vue administrateur — commissions, dettes et retraits.</p>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !allowed ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <ShieldAlert className="w-6 h-6 text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">
              Cette page est réservée aux administrateurs de la plateforme.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="bg-card border border-border rounded-2xl p-6">
                <Landmark className="w-5 h-5 text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Commissions collectées (20%)</p>
                <p className="text-2xl font-bold gradient-text">{formatPi(stats.commissions)}</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-6">
                <Users className="w-5 h-5 text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Dû aux vendeurs (non retiré)</p>
                <p className="text-2xl font-bold">{formatPi(stats.owed)}</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-6">
                <ArrowDownToLine className="w-5 h-5 text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Volume total encaissé</p>
                <p className="text-2xl font-bold">{formatPi(stats.gross)}</p>
              </div>
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-4">Transactions</h2>
              {earnings.length === 0 ? (
                <p className="text-muted-foreground">Aucune transaction enregistrée.</p>
              ) : (
                <div className="overflow-x-auto border border-border rounded-2xl">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="text-left p-3">Date</th>
                        <th className="text-left p-3">Type</th>
                        <th className="text-right p-3">Total</th>
                        <th className="text-right p-3">Commission</th>
                        <th className="text-right p-3">Vendeur</th>
                        <th className="text-left p-3">Retrait</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earnings.map((e) => (
                        <tr key={e.id} className="border-t border-border">
                          <td className="p-3">{dateFr(e.created_at)}</td>
                          <td className="p-3">{TRANSACTION_LABELS[e.transaction_type]}</td>
                          <td className="p-3 text-right">{formatPi(e.total_amount)}</td>
                          <td className="p-3 text-right gradient-text font-semibold">
                            {formatPi(e.platform_fee)}
                          </td>
                          <td className="p-3 text-right">{formatPi(e.seller_earnings)}</td>
                          <td className="p-3">
                            <Badge variant={e.payout_status === "paid" ? "default" : "secondary"}>
                              {e.payout_status === "paid"
                                ? "Payé"
                                : e.payout_status === "processing"
                                  ? "En cours"
                                  : "Non retiré"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-display text-xl font-bold mb-4">Retraits effectués</h2>
              {payouts.length === 0 ? (
                <p className="text-muted-foreground">Aucun retrait.</p>
              ) : (
                <ul className="space-y-3">
                  {payouts.map((p) => (
                    <li
                      key={p.id}
                      className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="font-semibold">{formatPi(p.amount)}</p>
                        <p className="text-xs text-muted-foreground break-all">
                          {dateFr(p.requested_at)} — vendeur {p.seller_id.slice(0, 8)}…
                          {p.txid ? ` — tx ${p.txid.slice(0, 10)}…` : ""}
                          {p.error_message ? ` — ${p.error_message}` : ""}
                        </p>
                      </div>
                      <Badge variant={p.status === "completed" ? "default" : "secondary"}>
                        {PAYOUT_STATE_LABELS[p.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default PlatformRevenue;
