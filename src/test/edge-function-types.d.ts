// Allow unit tests to import the backend-only engine without changing its Deno imports.
declare module "https://esm.sh/@supabase/supabase-js@2.45.0" {
  export type SupabaseClient = import("@supabase/supabase-js").SupabaseClient;
}