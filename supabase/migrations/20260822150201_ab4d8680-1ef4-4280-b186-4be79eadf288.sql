-- ===== ENUMS =====
CREATE TYPE public.sellfy_level AS ENUM ('level_0','level_1','level_2','level_3');
CREATE TYPE public.mission_period AS ENUM ('daily','weekly','monthly','special');
CREATE TYPE public.mission_state AS ENUM ('in_progress','completed','claimed','expired');
CREATE TYPE public.dispute_state AS ENUM ('open','resolved','rejected');
CREATE TYPE public.boost_state AS ENUM ('active','expired','cancelled');
CREATE TYPE public.club_tier AS ENUM ('standard','pro');
CREATE TYPE public.reward_currency AS ENUM ('points','xp');

-- ===== SELLER REVIEWS =====
CREATE TABLE public.seller_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_id)
);
GRANT SELECT, INSERT ON public.seller_reviews TO authenticated;
GRANT SELECT ON public.seller_reviews TO anon;
GRANT ALL ON public.seller_reviews TO service_role;
ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read reviews" ON public.seller_reviews FOR SELECT USING (true);
CREATE POLICY "Real buyers can review their completed purchase" ON public.seller_reviews
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = buyer_id
    AND auth.uid() <> seller_id
    AND EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.id = purchase_id
        AND p.user_id = auth.uid()
        AND p.seller_id = seller_reviews.seller_id
        AND p.status = 'completed'
        AND p.txid IS NOT NULL
    )
  );
CREATE TRIGGER seller_reviews_set_updated_at BEFORE UPDATE ON public.seller_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX seller_reviews_seller_idx ON public.seller_reviews(seller_id);

-- ===== DISPUTES =====
CREATE TABLE public.order_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  reason text NOT NULL,
  status public.dispute_state NOT NULL DEFAULT 'open',
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_id)
);
GRANT SELECT, INSERT ON public.order_disputes TO authenticated;
GRANT ALL ON public.order_disputes TO service_role;
ALTER TABLE public.order_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties and admins can view disputes" ON public.order_disputes
  FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR private.has_role(auth.uid(),'admin'));
CREATE POLICY "Buyers can open a dispute on their purchase" ON public.order_disputes
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = buyer_id AND auth.uid() <> seller_id
    AND EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND p.user_id = auth.uid())
  );
CREATE TRIGGER order_disputes_set_updated_at BEFORE UPDATE ON public.order_disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX order_disputes_seller_idx ON public.order_disputes(seller_id);

-- ===== SELLER STATS =====
CREATE TABLE public.seller_stats (
  seller_id uuid PRIMARY KEY,
  orders_completed integer NOT NULL DEFAULT 0,
  orders_cancelled integer NOT NULL DEFAULT 0,
  inquiries_received integer NOT NULL DEFAULT 0,
  inquiries_answered integer NOT NULL DEFAULT 0,
  late_deliveries integer NOT NULL DEFAULT 0,
  first_sale_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_stats TO authenticated;
GRANT ALL ON public.seller_stats TO service_role;
ALTER TABLE public.seller_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers and admins can view stats" ON public.seller_stats
  FOR SELECT TO authenticated USING (auth.uid() = seller_id OR private.has_role(auth.uid(),'admin'));
CREATE TRIGGER seller_stats_set_updated_at BEFORE UPDATE ON public.seller_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== SELLER PERFORMANCE =====
CREATE TABLE public.seller_performance (
  seller_id uuid PRIMARY KEY,
  success_score numeric NOT NULL DEFAULT 0,
  quality_score numeric NOT NULL DEFAULT 0,
  communication_score numeric NOT NULL DEFAULT 0,
  reliability_score numeric NOT NULL DEFAULT 0,
  order_completion_score numeric NOT NULL DEFAULT 0,
  review_score numeric NOT NULL DEFAULT 0,
  response_score numeric NOT NULL DEFAULT 0,
  cancellation_rate numeric NOT NULL DEFAULT 0,
  dispute_rate numeric NOT NULL DEFAULT 0,
  average_rating numeric NOT NULL DEFAULT 0,
  reviews_count integer NOT NULL DEFAULT 0,
  data_sufficient boolean NOT NULL DEFAULT false,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_performance TO authenticated;
GRANT ALL ON public.seller_performance TO service_role;
ALTER TABLE public.seller_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers and admins can view performance" ON public.seller_performance
  FOR SELECT TO authenticated USING (auth.uid() = seller_id OR private.has_role(auth.uid(),'admin'));
CREATE TRIGGER seller_performance_set_updated_at BEFORE UPDATE ON public.seller_performance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== SELLER REPUTATION (public-facing parts) =====
CREATE TABLE public.seller_reputation (
  seller_id uuid PRIMARY KEY,
  reputation_score numeric NOT NULL DEFAULT 0,
  public_rating numeric NOT NULL DEFAULT 0,
  public_orders_completed integer NOT NULL DEFAULT 0,
  fast_responder boolean NOT NULL DEFAULT false,
  reliable_seller boolean NOT NULL DEFAULT false,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_reputation TO authenticated;
GRANT SELECT ON public.seller_reputation TO anon;
GRANT ALL ON public.seller_reputation TO service_role;
ALTER TABLE public.seller_reputation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reputation is public" ON public.seller_reputation FOR SELECT USING (true);
CREATE TRIGGER seller_reputation_set_updated_at BEFORE UPDATE ON public.seller_reputation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== LEVEL REQUIREMENTS (admin configurable) =====
CREATE TABLE public.seller_level_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level public.sellfy_level NOT NULL UNIQUE,
  label text NOT NULL,
  minimum_orders integer NOT NULL DEFAULT 0,
  minimum_rating numeric NOT NULL DEFAULT 0,
  minimum_response_rate numeric NOT NULL DEFAULT 0,
  maximum_cancellation_rate numeric NOT NULL DEFAULT 100,
  maximum_dispute_rate numeric NOT NULL DEFAULT 100,
  minimum_success_score numeric NOT NULL DEFAULT 0,
  minimum_account_age_days integer NOT NULL DEFAULT 0,
  minimum_reviews integer NOT NULL DEFAULT 0,
  manual_review_required boolean NOT NULL DEFAULT false,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_level_requirements TO authenticated;
GRANT SELECT ON public.seller_level_requirements TO anon;
GRANT ALL ON public.seller_level_requirements TO service_role;
ALTER TABLE public.seller_level_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requirements are public" ON public.seller_level_requirements FOR SELECT USING (true);
CREATE POLICY "Admins manage requirements" ON public.seller_level_requirements
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER slr_set_updated_at BEFORE UPDATE ON public.seller_level_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.seller_level_requirements
 (level,label,minimum_orders,minimum_rating,minimum_response_rate,maximum_cancellation_rate,maximum_dispute_rate,minimum_success_score,minimum_account_age_days,minimum_reviews,manual_review_required,benefits)
VALUES
 ('level_0','New Seller',0,0,0,100,100,0,0,0,false,'["Profil vendeur","Publication de produits et services","Missions Sellfy"]'),
 ('level_1','Sellfy Rising',5,4.4,80,10,5,60,14,3,false,'["Badge Sellfy Rising","Plus de publications","Statistiques etendues","Coupons"]'),
 ('level_2','Sellfy Pro',20,4.7,90,5,3,80,45,10,false,'["Badge PRO","Analytics avances","Outils marketing","Sellfy Boost","Profil mis en avant"]'),
 ('level_3','Sellfy Top',75,4.8,95,3,1,90,120,30,true,'["Badge Top Seller","Mise en avant maximale","Support prioritaire","Acces anticipe"]');

-- ===== SELLER LEVELS (computed state) =====
CREATE TABLE public.seller_levels (
  seller_id uuid PRIMARY KEY,
  level public.sellfy_level NOT NULL DEFAULT 'level_0',
  eligible_level public.sellfy_level NOT NULL DEFAULT 'level_0',
  pending_manual_review boolean NOT NULL DEFAULT false,
  under_watch boolean NOT NULL DEFAULT false,
  watch_started_at timestamptz,
  downgrade_warned_at timestamptz,
  level_since timestamptz NOT NULL DEFAULT now(),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_best_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_levels TO authenticated;
GRANT SELECT ON public.seller_levels TO anon;
GRANT ALL ON public.seller_levels TO service_role;
ALTER TABLE public.seller_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Seller level is public" ON public.seller_levels FOR SELECT USING (true);
CREATE TRIGGER seller_levels_set_updated_at BEFORE UPDATE ON public.seller_levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== REWARDS BALANCES =====
CREATE TABLE public.user_rewards (
  user_id uuid PRIMARY KEY,
  points_balance integer NOT NULL DEFAULT 0,
  points_lifetime integer NOT NULL DEFAULT 0,
  xp_total integer NOT NULL DEFAULT 0,
  buyer_level integer NOT NULL DEFAULT 0,
  orders_placed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_rewards TO authenticated;
GRANT ALL ON public.user_rewards TO service_role;
ALTER TABLE public.user_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users and admins can view rewards" ON public.user_rewards
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'));
CREATE TRIGGER user_rewards_set_updated_at BEFORE UPDATE ON public.user_rewards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.points_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  source_type text NOT NULL,
  source_id text,
  balance_after integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id, reason)
);
GRANT SELECT ON public.points_transactions TO authenticated;
GRANT ALL ON public.points_transactions TO service_role;
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users and admins can view points history" ON public.points_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'));

CREATE TABLE public.xp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  source_type text NOT NULL,
  source_id text,
  total_after integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id, reason)
);
GRANT SELECT ON public.xp_transactions TO authenticated;
GRANT ALL ON public.xp_transactions TO service_role;
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users and admins can view xp history" ON public.xp_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'));

-- ===== BADGES =====
CREATE TABLE public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'seller',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.badges TO authenticated;
GRANT SELECT ON public.badges TO anon;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges are public" ON public.badges FOR SELECT USING (true);
CREATE POLICY "Admins manage badges" ON public.badges FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER badges_set_updated_at BEFORE UPDATE ON public.badges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.badges (code,name,description,audience,criteria) VALUES
 ('first_sale','First Sale','Premiere vente terminee','seller','{"orders_completed":1}'),
 ('first_order','First Order','Premiere commande passee','buyer','{"orders_placed":1}'),
 ('rising_seller','Rising Seller','Niveau Sellfy Rising atteint','seller','{"level":"level_1"}'),
 ('pro_seller','Pro Seller','Niveau Sellfy Pro atteint','seller','{"level":"level_2"}'),
 ('top_seller','Top Seller','Niveau Sellfy Top atteint','seller','{"level":"level_3"}'),
 ('top_rated','Top Rated','Note moyenne d''au moins 4.9 sur 10 avis','seller','{"min_rating":4.9,"min_reviews":10}'),
 ('fast_response','Fast Response','Taux de reponse superieur a 95%','seller','{"min_response_rate":95}'),
 ('reliable_seller','Reliable Seller','Moins de 2% d''annulations sur 20 commandes','seller','{"max_cancellation_rate":2,"orders_completed":20}'),
 ('orders_100','100 Orders','100 commandes terminees','seller','{"orders_completed":100}'),
 ('orders_500','500 Orders','500 commandes terminees','seller','{"orders_completed":500}'),
 ('community_contributor','Community Contributor','Contribution active a la communaute Sellfy','seller','{"manual":true}');

CREATE TABLE public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);
GRANT SELECT ON public.user_badges TO authenticated;
GRANT SELECT ON public.user_badges TO anon;
GRANT ALL ON public.user_badges TO service_role;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Earned badges are public" ON public.user_badges FOR SELECT USING (true);

-- ===== MISSIONS =====
CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  period public.mission_period NOT NULL DEFAULT 'daily',
  audience text NOT NULL DEFAULT 'seller',
  target integer NOT NULL DEFAULT 1,
  metric text NOT NULL,
  reward_points integer NOT NULL DEFAULT 0,
  reward_xp integer NOT NULL DEFAULT 0,
  reward_badge_code text,
  reward_boost_hours integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.missions TO authenticated;
GRANT SELECT ON public.missions TO anon;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Missions are public" ON public.missions FOR SELECT USING (true);
CREATE POLICY "Admins manage missions" ON public.missions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER missions_set_updated_at BEFORE UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.missions (code,title,description,period,audience,target,metric,reward_points,reward_xp,reward_boost_hours) VALUES
 ('daily_answer_inquiries','Repondez a vos nouveaux messages','Repondez aux demandes recues aujourd''hui','daily','seller',1,'inquiries_answered',10,5,0),
 ('daily_visit','Consultez votre tableau de bord','Suivez vos performances du jour','daily','seller',1,'dashboard_visit',5,2,0),
 ('weekly_complete_3_orders','Terminez 3 commandes','Livrez 3 commandes cette semaine','weekly','seller',3,'orders_completed',60,40,0),
 ('weekly_publish_listing','Publiez un nouveau service','Ajoutez une offre a votre catalogue','weekly','seller',1,'listings_published',30,20,0),
 ('monthly_reviews','Obtenez 5 nouvelles evaluations','Collectez 5 avis ce mois','monthly','seller',5,'reviews_received',120,80,24),
 ('special_first_review','Obtenez votre premiere evaluation','Votre premier avis client','special','seller',1,'reviews_received',50,50,0),
 ('special_complete_profile','Completez votre profil','Ajoutez votre portfolio et vos informations','special','seller',1,'profile_completed',40,30,0),
 ('buyer_first_order','Passez votre premiere commande','Votre premier achat sur Sellfy','special','buyer',1,'orders_placed',30,20,0),
 ('buyer_leave_review','Laissez un avis','Evaluez un vendeur apres achat','weekly','buyer',1,'reviews_written',20,10,0);

CREATE TABLE public.user_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  status public.mission_state NOT NULL DEFAULT 'in_progress',
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_id, period_key)
);
GRANT SELECT ON public.user_missions TO authenticated;
GRANT ALL ON public.user_missions TO service_role;
ALTER TABLE public.user_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users and admins can view missions progress" ON public.user_missions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'));
CREATE TRIGGER user_missions_set_updated_at BEFORE UPDATE ON public.user_missions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== BOOSTS =====
CREATE TABLE public.seller_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  target_type text NOT NULL DEFAULT 'product',
  target_id text NOT NULL,
  target_label text NOT NULL DEFAULT '',
  paid_with text NOT NULL DEFAULT 'points',
  points_spent integer NOT NULL DEFAULT 0,
  pi_amount numeric NOT NULL DEFAULT 0,
  pi_payment_id text,
  status public.boost_state NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_boosts TO authenticated;
GRANT ALL ON public.seller_boosts TO service_role;
ALTER TABLE public.seller_boosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers and admins can view boosts" ON public.seller_boosts
  FOR SELECT TO authenticated USING (auth.uid() = seller_id OR private.has_role(auth.uid(),'admin'));
CREATE TRIGGER seller_boosts_set_updated_at BEFORE UPDATE ON public.seller_boosts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== SELLFY CLUB =====
CREATE TABLE public.sellfy_club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  tier public.club_tier NOT NULL DEFAULT 'standard',
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sellfy_club_memberships TO authenticated;
GRANT ALL ON public.sellfy_club_memberships TO service_role;
ALTER TABLE public.sellfy_club_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers and admins can view club membership" ON public.sellfy_club_memberships
  FOR SELECT TO authenticated USING (auth.uid() = seller_id OR private.has_role(auth.uid(),'admin'));
CREATE TRIGGER club_set_updated_at BEFORE UPDATE ON public.sellfy_club_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== AUDIT & FRAUD =====
CREATE TABLE public.reward_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reward_audit_logs TO authenticated;
GRANT ALL ON public.reward_audit_logs TO service_role;
ALTER TABLE public.reward_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their audit trail, admins see all" ON public.reward_audit_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR private.has_role(auth.uid(),'admin'));

CREATE TABLE public.reward_fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reward_fraud_flags TO authenticated;
GRANT ALL ON public.reward_fraud_flags TO service_role;
ALTER TABLE public.reward_fraud_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view fraud flags" ON public.reward_fraud_flags
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));