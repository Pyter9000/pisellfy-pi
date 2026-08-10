import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authenticateWithPi } from "@/lib/pi";
import { redirectAfterAuth } from "@/lib/piConfig";
import { toast } from "@/hooks/use-toast";

interface PiAuthContextValue {
  session: Session | null;
  user: User | null;
  piUsername: string | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

interface VerifyResponse {
  access_token?: string;
  refresh_token?: string;
  user?: User;
}

interface AuthErrorDetails {
  status: number;
  statusText: string;
  body: unknown;
}

class PiSessionExchangeError extends Error {
  readonly details: AuthErrorDetails;

  constructor(message: string, details: AuthErrorDetails) {
    super(message);
    this.name = "PiSessionExchangeError";
    this.details = details;
  }
}

/**
 * Exchanges the one-time hash without auth-js adding gotrue_meta_security.
 * The auth endpoint used by this project strictly accepts token_hash + type only.
 */
const exchangePiTokenHash = async (tokenHash: string): Promise<Session> => {
  const authUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!authUrl || !publishableKey) throw new Error("Backend authentication configuration is missing");

  const verifyPayload = { token_hash: tokenHash, type: "magiclink" as const };
  console.info("Pi token_hash received", {
    present: tokenHash.length > 0,
    length: tokenHash.length,
    format: /^[A-Za-z0-9_-]+$/.test(tokenHash) ? "url-safe" : "unexpected",
    masked: tokenHash.length > 12
      ? `${tokenHash.slice(0, 6)}…${tokenHash.slice(-6)}`
      : "[redacted]",
    verifyPayloadKeys: Object.keys(verifyPayload),
    type: verifyPayload.type,
  });

  const response = await fetch(`${authUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(verifyPayload),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const details = { status: response.status, statusText: response.statusText, body };
    console.error("Pi session exchange raw backend error", details);
    const backendMessage =
      typeof body === "object" && body !== null && "msg" in body && typeof body.msg === "string"
        ? body.msg
        : `Session exchange failed (${response.status})`;
    throw new PiSessionExchangeError(backendMessage, details);
  }

  const verified = body as VerifyResponse;
  if (!verified.access_token || !verified.refresh_token) {
    throw new Error("Backend verification did not return a complete session");
  }
  const { data, error: sessionError } = await supabase.auth.setSession({
    access_token: verified.access_token,
    refresh_token: verified.refresh_token,
  });
  if (sessionError || !data.session) throw sessionError ?? new Error("Could not persist the Pi session");
  return data.session;
};

const PiAuthContext = createContext<PiAuthContextValue | undefined>(undefined);

export const PiAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [piUsername, setPiUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      const name = nextSession?.user?.user_metadata?.pi_username;
      if (typeof name === "string") setPiUsername(name);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      const name = data.session?.user?.user_metadata?.pi_username;
      if (typeof name === "string") setPiUsername(name);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const runSignIn = useCallback(async (silent: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const auth = await authenticateWithPi();

      const { data, error: fnError } = await supabase.functions.invoke("pi-auth", {
        body: { accessToken: auth.accessToken },
      });
      if (fnError) throw new Error(fnError.message);
      if (typeof data?.token_hash !== "string" || data.token_hash.length === 0) {
        throw new Error("Backend did not return a valid session token_hash");
      }

      await exchangePiTokenHash(data.token_hash);

      setPiUsername(data.pi_username ?? auth.user?.username ?? null);
      if (!silent) {
        toast({
          title: "Signed in with Pi",
          description: `Welcome @${data.pi_username ?? auth.user?.username ?? "pioneer"}`,
        });
      }
      // Send the pioneer to the configured Pi redirect URI (no-op if already there).
      redirectAfterAuth();
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Pi authentication failed";
      const cancelled = /cancel|denied|abort|closed/i.test(raw);
      const message = cancelled
        ? "Pi sign-in was cancelled."
        : /Pi SDK|Pi Browser/i.test(raw)
          ? "Open this app in the Pi Browser to sign in with Pi."
          : raw;
      setError(message);
      console.error("Pi authentication failed (raw):", e);
      if (!silent) {
        toast({
          title: cancelled ? "Sign-in cancelled" : "Pi sign-in failed",
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(() => runSignIn(false), [runSignIn]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPiUsername(null);
  }, []);

  // Automatically trigger Pi authentication on app load (silent: no toast noise).
  useEffect(() => {
    if (loading || session || autoTried.current) return;
    autoTried.current = true;
    void runSignIn(true);
  }, [loading, session, runSignIn]);

  return (
    <PiAuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        piUsername,
        loading,
        error,
        signIn,
        signOut,
      }}
    >
      {children}
    </PiAuthContext.Provider>
  );
};

export const usePiAuth = () => {
  const ctx = useContext(PiAuthContext);
  if (!ctx) throw new Error("usePiAuth must be used within a PiAuthProvider");
  return ctx;
};
