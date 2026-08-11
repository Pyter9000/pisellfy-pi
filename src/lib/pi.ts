// Pi Network SDK loader + init helper.
// Docs: https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Authentication
//       https://pi-apps.github.io/pi-sdk-docs/quick-start/genai/Payments
import { PI_OAUTH_CLIENT_ID, PI_SCOPES } from "@/lib/piConfig";

export interface PiAuthResult {
  accessToken: string;
  user: { uid: string; username: string; credentials?: { scopes?: string[] } };
  /** Some SDK versions expose the granted scopes at the root. */
  scopes?: string[];
}


export interface PiPaymentDTO {
  identifier: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  transaction?: { txid: string; verified: boolean } | null;
}

export interface PiPaymentData {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}

export interface PiPaymentCallbacks {
  onReadyForServerApproval: (paymentId: string) => void;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void;
  onCancel: (paymentId: string) => void;
  onError: (error: Error, payment?: PiPaymentDTO) => void;
}

export interface PiSDK {
  init: (config: { version: string; sandbox?: boolean }) => Promise<void> | void;
  authenticate: (
    scopes: string[],
    onIncompletePaymentFound: (payment: PiPaymentDTO) => void,
  ) => Promise<PiAuthResult>;
  createPayment: (data: PiPaymentData, callbacks: PiPaymentCallbacks) => void;
}

declare global {
  interface Window {
    Pi?: PiSDK;
  }
}

const SDK_URL = "https://sdk.minepi.com/pi-sdk.js";

let loadPromise: Promise<PiSDK> | null = null;

export function loadPiSdk(): Promise<PiSDK> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<PiSDK>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Pi SDK requires a browser environment"));
      return;
    }
    if (window.Pi) {
      resolve(window.Pi);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      if (window.Pi) resolve(window.Pi);
      else reject(new Error("Pi SDK loaded but window.Pi is unavailable"));
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", () =>
      reject(new Error("Failed to load the Pi SDK. Open this app in the Pi Browser.")),
    );

    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return loadPromise;
}

let initPromise: Promise<PiSDK> | null = null;

/** Loads the SDK and awaits Pi.init() fully (it is treated as a Promise). */
export function initPi(): Promise<PiSDK> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!PI_OAUTH_CLIENT_ID) {
      throw new Error(
        "Pi OAuth Client ID is missing. Set VITE_PI_OAUTH_CLIENT_ID in your environment.",
      );
    }

    const Pi = await loadPiSdk();
    const sandbox =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname.endsWith(".lovable.app"));
    // Pi.init may return a Promise - await it fully before authenticating or paying.
    // The SDK registers the app via the Client ID bound to the current origin in the
    // Pi Developer Portal; VITE_PI_OAUTH_CLIENT_ID is the canonical reference here.
    await Promise.resolve(Pi.init({ version: "2.0", sandbox }));
    return Pi;
  })();

  return initPromise;
}

/** Completes a payment that was left in-flight from a previous session. */
export async function handleIncompletePayment(payment: PiPaymentDTO) {
  const { completeIncompletePayment } = await import("@/lib/piPayments");
  await completeIncompletePayment(payment);
}

/** Scopes granted by the last successful Pi.authenticate() call. */
let grantedScopes: string[] = [];

export const getGrantedScopes = () => [...grantedScopes];
export const hasPaymentsScope = () => grantedScopes.includes("payments");

const readScopes = (auth: PiAuthResult): string[] => {
  const fromRoot = Array.isArray(auth?.scopes) ? auth.scopes : undefined;
  const fromUser = Array.isArray(auth?.user?.credentials?.scopes)
    ? auth.user.credentials.scopes
    : undefined;
  // If the SDK does not report scopes, assume the ones we requested were granted.
  return fromRoot ?? fromUser ?? [...PI_SCOPES];
};

export async function authenticateWithPi(): Promise<PiAuthResult> {
  const Pi = await initPi();
  // "username" is the minimum; "payments" is required for U2A payments via Pi.createPayment.
  const requested = [...PI_SCOPES];
  const auth = await Pi.authenticate(requested, (payment) => {
    void handleIncompletePayment(payment);
  });
  grantedScopes = readScopes(auth);
  console.info("Pi.authenticate granted scopes", {
    requested,
    granted: grantedScopes,
    hasPayments: grantedScopes.includes("payments"),
    reportedBySdk: Boolean(auth?.scopes ?? auth?.user?.credentials?.scopes),
  });
  return auth;
}

/**
 * Guarantees the current Pi session carries the "payments" scope.
 * A pioneer who signed in before the payments scope existed keeps a Supabase
 * session but no payments grant, so we re-authenticate with both scopes.
 */
export async function ensurePaymentsScope(): Promise<PiAuthResult | null> {
  if (hasPaymentsScope()) return null;
  const auth = await authenticateWithPi();
  if (!grantedScopes.includes("payments")) {
    throw new Error(
      "The 'payments' permission was not granted. Approve it in the Pi Browser prompt to buy this product.",
    );
  }
  return auth;
}

