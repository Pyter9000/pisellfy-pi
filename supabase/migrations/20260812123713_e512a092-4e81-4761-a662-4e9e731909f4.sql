CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
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

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "Sellers and admins can view earnings" ON public.earnings;
CREATE POLICY "Sellers and admins can view earnings" ON public.earnings
  FOR SELECT TO authenticated
  USING ((auth.uid() = seller_id) OR (auth.uid() = buyer_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view payout audit log" ON public.payout_audit_log;
CREATE POLICY "Admins can view payout audit log" ON public.payout_audit_log
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Sellers and admins can view payouts" ON public.payouts;
CREATE POLICY "Sellers and admins can view payouts" ON public.payouts
  FOR SELECT TO authenticated
  USING ((auth.uid() = seller_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Sellers and admins can view balances" ON public.seller_balances;
CREATE POLICY "Sellers and admins can view balances" ON public.seller_balances
  FOR SELECT TO authenticated
  USING ((auth.uid() = seller_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);