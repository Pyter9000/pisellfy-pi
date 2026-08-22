# Sellfy Levels, Rewards & Seller Growth

## Ce qui existe déjà
- Auth Pi + paiements Pi (U2A) et payouts A2U — **non modifiés**.
- `purchases` (achats confirmés), `earnings`, `seller_balances`, `payouts`, `subscription_*`, `user_roles` (+ `has_role` en schéma privé).
- Pas de table de commandes/services/avis/messages : donc **aucune donnée réelle** pour note moyenne, taux de réponse, litiges.

## Décision importante
Le score de performance et la réputation doivent être calculés sur des données réelles. Comme les avis, litiges et messages n'existent pas encore, je crée les tables minimales nécessaires (`seller_reviews`, `order_disputes`, compteurs de réponse) alimentées par les achats Pi confirmés, et les métriques absentes restent neutres (non notées) plutôt qu'inventées.

## Phase 1 — Base de données (une migration)
Tables (RLS + GRANT sur chacune) :
- `seller_profiles_stats` : commandes terminées, annulées, dernier calcul.
- `seller_reviews` : note 1-5 + commentaire, un avis par achat confirmé, auteur = acheteur réel de `purchases`.
- `order_disputes` : litige lié à un achat.
- `seller_performance` : success/quality/communication/reliability/order_completion/review/response scores, cancellation_rate, dispute_rate, score global 0-100.
- `seller_reputation` : score 0-100 + éléments publics (note, commandes terminées, réponse rapide, fiabilité).
- `seller_levels` : niveau courant (0-3), éligibilité, statut de surveillance, date d'obtention.
- `seller_level_requirements` : critères configurables par niveau (commandes, note, réponse, annulation, litiges, performance, ancienneté, validation manuelle) — seed des 4 niveaux, aucune valeur codée en dur côté app.
- `user_rewards` (points, xp, buyer_level), `points_transactions`, `xp_transactions`.
- `badges` + `user_badges` (seed des badges listés).
- `missions` + `user_missions` (daily/weekly/monthly/special).
- `seller_boosts` (payé en Points ou Pi, durée limitée).
- `sellfy_club_memberships` (STANDARD / PRO, adossé aux abonnements existants).
- `reward_audit_logs`, `reward_fraud_flags`.

RLS : lecture de ses propres lignes uniquement ; admin via `has_role`. **Aucune écriture directe** possible depuis le frontend sur les points, XP, scores, niveaux et badges (pas de policy INSERT/UPDATE pour `authenticated`) — seules les fonctions serveur écrivent. Les avis/litiges sont insérables par l'acheteur réel uniquement.

## Phase 2 — Moteur serveur (edge functions)
- `sellfy-rewards` (`_shared/rewards.ts`) :
  - `calculateSellerLevel(userId)` : lit les données → performance → réputation → compare aux critères configurés → niveau (avec observation/avertissement avant downgrade, minimum de données requis, éligibilité + validation manuelle pour Level 3) → écrit → renvoie la progression détaillée.
  - `awardPoints` / `awardXp` : idempotents, sourcés par référence (achat, avis, mission), journalisés.
  - Attribution automatique des badges selon critères vérifiés.
  - `nextBestAction` : critère le plus proche/le plus impactant.
  - Anti-fraude : pas d'auto-commande (acheteur ≠ vendeur), achat `completed` avec `txid` Pi requis, plafonds journaliers, `reward_fraud_flags`.
- Actions exposées : `get-seller-dashboard`, `get-buyer-dashboard`, `recalculate`, `claim-mission`, `create-boost`, `admin-*` (critères, ajustements Points/XP, validation Top, gestion badges/missions/club).
- Branchement dans `pi-payment` après complétion : XP + Points + recalcul du niveau du vendeur.

## Phase 3 — Frontend
- `/seller/performance` : niveau Sellfy, Performance Score, Réputation, barres de progression critère par critère, « Pourquoi suis-je à ce niveau ? », Next Best Action, commandes, avis, réponse, annulations, litiges, Points, XP, badges, missions, Boost, Sellfy Club.
- `/rewards` (acheteur) : Points, XP, badges, commandes, missions, prochaine récompense.
- `/admin/seller-levels` : édition des critères par niveau, scores, Points/XP, badges, missions, Boost, Club, file de validation Top, flags anti-fraude.
- Badge de niveau réutilisable + liens navbar.

## Tests
Tests unitaires du calcul (performance, réputation, seuils, downgrade avec observation, rejet d'auto-commande) et vérification navigateur des 3 dashboards. Les scénarios nécessitant un vrai paiement Pi Mainnet et le multi-device seront marqués NON TESTÉ.

## Notes
- Aucun copiage de Fiverr : nomenclature, critères et UI propres à Sellfy.
- Le niveau n'est jamais achetable : ni Points, ni Pi, ni abonnement Club ne l'influencent.
