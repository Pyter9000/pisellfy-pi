ALTER TABLE public.seller_levels
  ADD COLUMN IF NOT EXISTS top_override text CHECK (top_override IN ('granted','rejected')),
  ADD COLUMN IF NOT EXISTS top_override_by uuid,
  ADD COLUMN IF NOT EXISTS top_override_at timestamptz;

CREATE TABLE public.seller_moderation (
  seller_id uuid PRIMARY KEY,
  suspended boolean NOT NULL DEFAULT false,
  suspended_at timestamptz,
  suspended_by uuid,
  suspension_reason text,
  warnings_count integer NOT NULL DEFAULT 0,
  last_warning_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seller_moderation TO authenticated;
GRANT ALL ON public.seller_moderation TO service_role;
ALTER TABLE public.seller_moderation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Seller reads own moderation" ON public.seller_moderation FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER seller_moderation_set_updated_at BEFORE UPDATE ON public.seller_moderation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reward_fraud_flags
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;