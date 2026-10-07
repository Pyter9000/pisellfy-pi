import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAdmin();
  if (loading) return <main className="min-h-screen flex items-center justify-center bg-background"><Loader2 aria-label="Vérification de l’accès" className="h-6 w-6 animate-spin text-primary" /></main>;
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}