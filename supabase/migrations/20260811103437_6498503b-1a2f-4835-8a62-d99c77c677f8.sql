-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 2. Earnings ledger
CREATE TYPE public.transaction_type AS ENUM ('product', 'service', 'course', 'subscription');
CREATE TYPE public.payout_status AS ENUM ('unpaid', 'processing', 'paid');

CREATE TABLE public.earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid,
  buyer_id uuid NOT NULL,
  transaction_type public.transaction_type NOT NULL,
  reference_id text NOT NULL,
  payment_id text,
  total_amount numeric(20,7) NOT NULL CHECK (total_amount >= 0),
  platform_fee numeric(20,7) NOT NULL CHECK (platform_fee >= 0),
  seller_earnings numeric(20,7) NOT NULL CHECK (seller_earnings >= 0),
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.2000,
  payout_status public.payout_status NOT NULL DEFAULT 'unpaid',
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_type, payment_id)
);

CREATE INDEX earnings_seller_idx ON public.earnings (seller_id, payout_status);

GRANT SELECT ON public.earnings TO authenticated;
GRANT ALL ON public.earnings TO service_role;
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers and admins can view earnings"
ON public.earnings FOR SELECT TO authenticated
USING (auth.uid() = seller_id OR auth.uid() = buyer_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER earnings_set_updated_at
BEFORE UPDATE ON public.earnings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Seller balances
CREATE TABLE public.seller_balances (
  seller_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available_balance numeric(20,7) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  pending_balance numeric(20,7) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  total_earned numeric(20,7) NOT NULL DEFAULT 0 CHECK (total_earned >= 0),
  total_withdrawn numeric(20,7) NOT NULL DEFAULT 0 CHECK (total_withdrawn >= 0),
  minimum_payout numeric(20,7) NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seller_balances TO authenticated;
GRANT ALL ON public.seller_balances TO service_role;
ALTER TABLE public.seller_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers and admins can view balances"
ON public.seller_balances FOR SELECT TO authenticated
USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER seller_balances_set_updated_at
BEFORE UPDATE ON public.seller_balances
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Payouts
CREATE TYPE public.payout_state AS ENUM ('pending', 'approved', 'completed', 'failed', 'cancelled');

CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(20,7) NOT NULL CHECK (amount > 0),
  pi_payment_id text,
  txid text,
  memo text NOT NULL DEFAULT '',
  status public.payout_state NOT NULL DEFAULT 'pending',
  error_message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payouts_seller_idx ON public.payouts (seller_id, requested_at DESC);

GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers and admins can view payouts"
ON public.payouts FOR SELECT TO authenticated
USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER payouts_set_updated_at
BEFORE UPDATE ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.earnings
  ADD CONSTRAINT earnings_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.payouts(id) ON DELETE SET NULL;

-- Rate limit: at most one non-failed payout request per seller per day
CREATE OR REPLACE FUNCTION public.enforce_payout_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.payouts
    WHERE seller_id = NEW.seller_id
      AND status <> 'failed'
      AND requested_at > now() - interval '1 day'
  ) THEN
    RAISE EXCEPTION 'A payout was already requested in the last 24 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payouts_rate_limit
BEFORE INSERT ON public.payouts
FOR EACH ROW EXECUTE FUNCTION public.enforce_payout_rate_limit();

-- 5. Audit log
CREATE TABLE public.payout_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid,
  payout_id uuid REFERENCES public.payouts(id) ON DELETE SET NULL,
  action text NOT NULL,
  success boolean NOT NULL,
  amount numeric(20,7),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payout_audit_log TO authenticated;
GRANT ALL ON public.payout_audit_log TO service_role;
ALTER TABLE public.payout_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view payout audit log"
ON public.payout_audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 6. Seller reference on purchases (for revenue attribution)
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS seller_id uuid;