import { useEffect, useState } from "react";
import { ArrowDownToLine, Loader2, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/sections/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePiAuth } from "@/hooks/usePiAuth";
import { toast } from "@/hooks/use-toast";
import {
  formatPi,
  getMyBalance,
  listMyEarnings,
  listMyPayouts,
  PAYOUT_STATE_LABELS,
  PLATFORM_COMMISSION_RATE,
  requestWithdrawal,
  TRANSACTION_LABELS,
  type Earning,
  type Payout,
  type SellerBalance,
} from "@/lib/revenue/api";

const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

const Earnings = () => {
  const { session, signIn } = usePiAuth();
  const sellerId = session?.user?.id ?? null;
  const [balance, setBalance] = useState<SellerBalance | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = async (uid: string) => {
    setLoading(true);
    try {
      const [b, e, p] = await Promise.all([getMyBalance(uid), listMyEarnings(uid), listMyPayouts(uid)]);
      setBalance(b);
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
  };

  useEffect(() => {
    if (!sellerId) {
      setLoading(false);
      return;
    }
    void load(sellerId);
  }, [sellerId]);

  const withdraw = async () => {
    setWithdrawing(true);
    try {
      const result = await requestWithdrawal();
      toast({
        title: result.status === "completed" ? "Retrait envoyé" : "Retrait en cours",
        description:
          result.status === "completed"
            ? `${formatPi(result.amount)} envoyés vers votre wallet Pi.`
            : `${formatPi(result.amount)} en cours de transfert vers votre wallet Pi.`,
      });
      if (sellerId) await load(sellerId);
    } catch (err) {
      toast({
        title: "Retrait impossible",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setWithdrawing(false);
    }
  };

  const canWithdraw =
    !!balance && balance.available_balance > 0 && balance.available_balance >= balance.minimum_payout;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-28 pb-20">
        <header className="mb-10">
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-2">
            Mes <span className="gradient-text">revenus</span>
          </h1>
          <p className="text-muted-foreground">
            Vous conservez {Math.round((1 - PLATFORM_COMMISSION_RATE) * 100)}% de chaque vente ; la
            plateforme prélève {Math.round(PLATFORM_COMMISSION_RATE * 100)}% de commission.
          </p>
        </header>

        {!sellerId ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <p className="text-muted-foreground mb-4">
              Connectez-vous avec Pi pour consulter vos revenus.
            </p>
            <Button variant="gold" onClick={() => void signIn()}>
              Se connecter avec Pi
            </Button>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-10">
            {/* Balance cards */}
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="bg-card border border-border rounded-2xl p-6">
                <Wallet className="w-5 h-5 text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Solde disponible</p>
                <p className="text-2xl font-bold gradient-text">
                  {formatPi(balance?.available_balance ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum de retrait : {formatPi(balance?.minimum_payout ?? 5)}
                </p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-6">
                <TrendingUp className="w-5 h-5 text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Total gagné (net)</p>
                <p className="text-2xl font-bold">{formatPi(balance?.total_earned ?? 0)}</p>
              </div>
              <div className="bg-card border border-border rounded-2xl p-6">
                <PiggyBank className="w-5 h-5 text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Déjà retiré</p>
                <p className="text-2xl font-bold">{formatPi(balance?.total_withdrawn ?? 0)}</p>
                {(balance?.pending_balance ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    En cours : {formatPi(balance?.pending_balance ?? 0)}
                  </p>
                )}
              </div>
            </section>

            {/* Withdraw */}
            <section className="bg-card border border-border rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold mb-1">Retirer mes gains</h2>
                <p className="text-sm text-muted-foreground">
                  {canWithdraw
                    ? "Le montant est envoyé directement vers votre wallet Pi (un retrait par 24 h)."
                    : `Atteignez ${formatPi(balance?.minimum_payout ?? 5)} de solde disponible pour retirer.`}
                </p>
              </div>
              {canWithdraw && (
                <Button variant="gold" onClick={() => void withdraw()} disabled={withdrawing}>
                  {withdrawing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowDownToLine className="w-4 h-4" />
                  )}
                  {withdrawing ? "Transfert en cours..." : `Retirer ${formatPi(balance!.available_balance)}`}
                </Button>
              )}
            </section>

            {/* Sales history */}
            <section>
              <h2 className="font-display text-xl font-bold mb-4">Historique des ventes</h2>
              {earnings.length === 0 ? (
                <p className="text-muted-foreground">Aucune vente pour le moment.</p>
              ) : (
                <div className="overflow-x-auto border border-border rounded-2xl">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="text-left p-3">Date</th>
                        <th className="text-left p-3">Type</th>
                        <th className="text-right p-3">Montant brut</th>
                        <th className="text-right p-3">Commission (20%)</th>
                        <th className="text-right p-3">Net (80%)</th>
                        <th className="text-left p-3">Retrait</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earnings.map((e) => (
                        <tr key={e.id} className="border-t border-border">
                          <td className="p-3">{dateFr(e.created_at)}</td>
                          <td className="p-3">{TRANSACTION_LABELS[e.transaction_type]}</td>
                          <td className="p-3 text-right">{formatPi(e.total_amount)}</td>
                          <td className="p-3 text-right text-muted-foreground">
                            −{formatPi(e.platform_fee)}
                          </td>
                          <td className="p-3 text-right font-semibold gradient-text">
                            {formatPi(e.seller_earnings)}
                          </td>
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

            {/* Payout history */}
            <section>
              <h2 className="font-display text-xl font-bold mb-4">Historique des retraits</h2>
              {payouts.length === 0 ? (
                <p className="text-muted-foreground">Aucun retrait effectué.</p>
              ) : (
                <ul className="space-y-3">
                  {payouts.map((p) => (
                    <li
                      key={p.id}
                      className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="font-semibold">{formatPi(p.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateFr(p.requested_at)}
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

export default Earnings;
