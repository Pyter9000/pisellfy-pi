import { useQuery } from "@tanstack/react-query";
import { usePiAuth } from "@/hooks/usePiAuth";
import { supabase } from "@/integrations/supabase/client";

export function useAdmin() {
  const { session, loading } = usePiAuth();
  const userId = session?.user.id;
  const query = useQuery({
    queryKey: ["admin-role", userId],
    enabled: Boolean(userId) && !loading,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId ?? "").eq("role", "admin").maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
  return { isAdmin: Boolean(userId && query.data), loading: loading || Boolean(userId && query.isPending), error: query.error };
}