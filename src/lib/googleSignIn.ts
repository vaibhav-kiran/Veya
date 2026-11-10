import { useClerk } from "@clerk/expo";
import { useSignInWithGoogle } from "@clerk/expo/google";
import type { LoadedClerk } from "@clerk/expo/types";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef } from "react";
import { Linking, Platform } from "react-native";

/**
 * Google sign-in, two ways:
 *
 * NATIVE (Android, when EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID is set): Android's
 * own Google account sheet (Credential Manager, via @clerk/expo-google-signin)
 * returns a Google ID token that Clerk exchanges for a session. No browser and no
 * redirect, so nothing can get stuck between Google, Clerk and the app.
 *
 * BROWSER (iOS, web, or Android without the client ID): Clerk runs the Google OAuth side; expo-linking and
 * expo-web-browser run the in-app browser round-trip.
 *
 *   1. Clerk creates a sign-in for `oauth_google` and returns Google's URL.
 *   2. `WebBrowser.openAuthSessionAsync` opens it and waits for the redirect URI
 *      built by `googleRedirectUri` (expo-linking).
 *   3. The redirect carries a `rotating_token_nonce`. `completeSSO` exchanges it
 *      for a Clerk session (creating the account on a first Google sign-in).
 *
 * On Android the browser can report "dismiss" while the redirect arrives as a
 * deep link instead, which Expo Router opens as `/sso-callback`. That route and
 * the button both call `completeSSO`, which runs once per nonce, so whichever
 * gets there first signs the user in.
 */

// Web: finishes the auth popup when it lands back on the app. A no-op on iOS/Android.
WebBrowser.maybeCompleteAuthSession();

export const log = (...args: unknown[]) => {
  if (__DEV__) console.log("[veya:google]", ...args);
};

/**
 * Where Clerk sends the browser after Google:
 * - Expo Go: exp://<host>/--/sso-callback (Expo Go owns the exp:// scheme)
 * - development / production builds: veya://sso-callback (the app.json `scheme`)
 */
// expo-linking, not expo-auth-session: the latter loads expo-crypto natively at import time.
export const googleRedirectUri = () => ExpoLinking.createURL("sso-callback", { scheme: "veya" });

export type SSOOutcome = { status: "signed-in" } | { status: "cancelled" } | { status: "failed"; message: string };

const FAILED = "Google sign-in didn't finish. Please try again.";
const completions = new Map<string, Promise<SSOOutcome>>();

/** Turns the finished browser round-trip into an active Clerk session. */
export function completeSSO(clerk: LoadedClerk, rotatingTokenNonce: string): Promise<SSOOutcome> {
  // A nonce identifies one redirect; without one, always ask Clerk again.
  const existing = rotatingTokenNonce ? completions.get(rotatingTokenNonce) : undefined;
  if (existing) return existing;

  const run = (async (): Promise<SSOOutcome> => {
    const signIn = await clerk.client.signIn.reload({ rotatingTokenNonce });
    const verification = signIn.firstFactorVerification;
    log("complete: sign-in", signIn.status, "| verification", verification.status, verification.error?.code ?? "");

    let sessionId = signIn.createdSessionId;
    // First Google sign-in for this email: turn it into a new Clerk account.
    if (verification.status === "transferable") {
      const signUp = await clerk.client.signUp.create({ transfer: true });
      log("complete: sign-up", signUp.status, "| missing", signUp.missingFields.join(","));
      if (signUp.status !== "complete") {
        return { status: "failed", message: "Google worked, but Clerk needs more details to create your account. Check the sign-up settings in the Clerk Dashboard." };
      }
      sessionId = signUp.createdSessionId;
    }

    if (!sessionId) {
      if (clerk.isSignedIn) return { status: "signed-in" }; // Already finished by the other path.
      return { status: "failed", message: verification.error?.longMessage ?? verification.error?.message ?? FAILED };
    }
    await clerk.setActive({ session: sessionId });
    return { status: "signed-in" };
  })().catch((error: unknown): SSOOutcome => {
    log("complete failed:", error);
    const first = (error as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0];
    return { status: "failed", message: first?.longMessage ?? first?.message ?? FAILED };
  });

  if (rotatingTokenNonce) completions.set(rotatingTokenNonce, run);
  return run;
}

/** Most recent completion started by the `/sso-callback` route, if any. */
let latestFromDeepLink: Promise<SSOOutcome> | null = null;
export function completeFromDeepLink(clerk: LoadedClerk, rotatingTokenNonce: string) {
  latestFromDeepLink = completeSSO(clerk, rotatingTokenNonce);
  return latestFromDeepLink;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Asks Clerk whether Google finished even though no redirect reached the app. */
async function checkWithClerk(clerk: LoadedClerk): Promise<SSOOutcome> {
  try {
    const signIn = await clerk.client.signIn.reload();
    const verification = signIn.firstFactorVerification;
    log("no redirect; Clerk says sign-in:", signIn.status, "| verification:", verification.status);
    const finished = signIn.status === "complete" || verification.status === "verified" || verification.status === "transferable";
    return finished ? completeSSO(clerk, "") : { status: "cancelled" };
  } catch (error) {
    log("check failed:", error);
    return { status: "cancelled" };
  }
}

/**
 * Polls Clerk while the browser is open. Resolves with the signed-in outcome
 * once Google has finished on Clerk's side; never resolves otherwise.
 */
async function watchClerkUntilDone(clerk: LoadedClerk, watch: { stopped: boolean }): Promise<SSOOutcome> {
  let lastStatus = "";
  while (!watch.stopped) {
    await wait(2000);
    if (watch.stopped) break;
    try {
      const signIn = await clerk.client.signIn.reload();
      const verification = signIn.firstFactorVerification;
      const status = `${signIn.status} / ${verification.status}`;
      if (status !== lastStatus) log("Clerk status while browser open:", status, verification.error?.code ?? "");
      lastStatus = status;
      const finished = signIn.status === "complete" || verification.status === "verified" || verification.status === "transferable";
      if (finished && !watch.stopped) {
        const outcome = await completeSSO(clerk, "");
        if (outcome.status === "signed-in") return outcome;
      }
    } catch (error) {
      log("Clerk check failed:", error);
    }
  }
  return new Promise<SSOOutcome>(() => undefined); // Lost the race; never settles.
}

/** The browser is still on top: close it (iOS) or reopen the app over it (Android). */
async function bringAppForward(redirectUri: string) {
  try {
    if (Platform.OS === "android") await Linking.openURL(redirectUri);
    else WebBrowser.dismissAuthSession();
  } catch (error) {
    log("couldn't bring the app forward:", error);
  }
}

async function runGoogleSignIn(clerk: LoadedClerk): Promise<SSOOutcome> {
  const redirectUri = googleRedirectUri();
  log("starting, redirect URI:", redirectUri);

  // 1. Clerk prepares the Google OAuth request and gives us the URL to open.
  const signIn = clerk.client.signIn;
  await signIn.create({ strategy: "oauth_google", redirectUrl: redirectUri });
  const authUrl = signIn.firstFactorVerification.externalVerificationRedirectURL;
  if (!authUrl) return { status: "failed", message: "Clerk didn't return a Google sign-in link. Is Google enabled in the Clerk Dashboard?" };

  // 2. Browser round-trip. Some Android browsers never hand the redirect back
  //    (the tab just keeps "loading"), so Clerk is also watched in parallel:
  //    whichever notices the finished Google sign-in first wins.
  latestFromDeepLink = null;
  const watch = { stopped: false };
  const browser = WebBrowser.openAuthSessionAsync(authUrl.toString(), redirectUri).then((result) => ({ from: "browser" as const, result }));
  const watcher = watchClerkUntilDone(clerk, watch).then((outcome) => ({ from: "clerk" as const, outcome }));
  const first = await Promise.race([browser, watcher]);
  watch.stopped = true;

  if (first.from === "clerk") {
    log("Clerk finished before the browser returned:", first.outcome.status);
    void bringAppForward(redirectUri);
    return first.outcome;
  }
  const result = first.result;
  log("browser result:", result.type, result.type === "success" ? result.url : "");

  // 3. Exchange the redirect for a session.
  if (result.type === "success") {
    const nonce = new URL(result.url).searchParams.get("rotating_token_nonce") ?? "";
    return completeSSO(clerk, nonce);
  }

  // Android: the redirect may arrive as a deep link just after the browser closes.
  for (let waited = 0; waited < 2500 && !latestFromDeepLink; waited += 250) await wait(250);
  if (latestFromDeepLink) return latestFromDeepLink;

  // No redirect at all (e.g. the tab kept "loading" and was closed by hand).
  return checkWithClerk(clerk);
}

/** Public Web client ID from Google Cloud; also set as Google's custom credentials in Clerk. */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID ?? "";
export const usesNativeGoogleSignIn = Platform.OS === "android" && GOOGLE_WEB_CLIENT_ID.length > 0;

type NativeGoogleFlow = ReturnType<typeof useSignInWithGoogle>["startGoogleAuthenticationFlow"];

async function runNativeGoogleSignIn(clerk: LoadedClerk, startFlow: NativeGoogleFlow): Promise<SSOOutcome> {
  log("starting native Google sign-in (Android account sheet)");
  try {
    const { createdSessionId, signUp } = await startFlow();
    log("native result: session", createdSessionId, "| sign-up", signUp?.status);
    if (createdSessionId) {
      await clerk.setActive({ session: createdSessionId });
      return { status: "signed-in" };
    }
    if (signUp?.status === "missing_requirements") {
      return { status: "failed", message: "Google worked, but Clerk needs more details to create your account. Check the sign-up settings in the Clerk Dashboard." };
    }
    return { status: "cancelled" }; // Sheet closed without choosing an account.
  } catch (error) {
    log("native failed:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("native module is not available")) {
      return { status: "failed", message: "Google sign-in needs a fresh app build. Rebuild the app (npx expo run:android) and try again." };
    }
    if (message.includes("[10]") || message.includes("DEVELOPER_ERROR")) {
      return { status: "failed", message: "Google rejected this app's setup. Check the Android OAuth client's package name and SHA-1 in Google Cloud." };
    }
    if (message.includes("No credentials available")) {
      return { status: "failed", message: "No Google account found on this phone. Add one in Android Settings → Accounts, then try again." };
    }
    const first = (error as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0];
    return { status: "failed", message: first?.longMessage ?? first?.message ?? (message || FAILED) };
  }
}

/**
 * Hook for the Google button. Pre-warms the Android browser while the screen
 * is open and lets only one sign-in run at a time.
 */
export function useGoogleSignIn() {
  const clerk = useClerk();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const running = useRef<Promise<SSOOutcome> | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android" || usesNativeGoogleSignIn) return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  return async (): Promise<SSOOutcome> => {
    if (running.current) return running.current;
    const flow = usesNativeGoogleSignIn ? runNativeGoogleSignIn(clerk, startGoogleAuthenticationFlow) : runGoogleSignIn(clerk);
    running.current = flow.finally(() => {
      running.current = null;
      // Close any browser session still open (not available on every platform).
      try {
        WebBrowser.dismissAuthSession();
      } catch {
        // Nothing to close.
      }
    });
    return running.current;
  };
}
