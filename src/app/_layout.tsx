import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { BootStatusScreen } from "@/components/BootStatusScreen";
import { SetupRequiredScreen } from "@/components/SetupRequiredScreen";
import { useStoresHydrated } from "@/hooks/useStoresHydrated";
import { useTimedOut } from "@/hooks/useTimedOut";
import { useAuth } from "@/lib/auth";
import { appConfig } from "@/lib/config";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useSessionStore } from "@/stores/sessionStore";
import { ACTIVE_THEME, colors, syncThemeWithSession, themeForSession } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** After this long, stop hiding behind the splash and show what startup is waiting on. */
const BOOT_TIMEOUT_MS = 8000;
const hideSplash = () => SplashScreen.hideAsync().catch(() => undefined);

/**
 * Inter is embedded natively by the expo-font config plugin in dev/production
 * builds; loading it at runtime as well keeps typography correct in Expo Go.
 */
const INTER_FONTS = {
  "Inter-Regular": require("../../assets/fonts/Inter-Regular.ttf"),
  "Inter-Medium": require("../../assets/fonts/Inter-Medium.ttf"),
  "Inter-SemiBold": require("../../assets/fonts/Inter-SemiBold.ttf"),
  "Inter-Bold": require("../../assets/fonts/Inter-Bold.ttf"),
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(INTER_FONTS);

  // Don't let a stalled font download block startup: after the timeout, carry on
  // with system fonts rather than leaving the splash screen up forever.
  const fontsTimedOut = useTimedOut(BOOT_TIMEOUT_MS);
  const fontsReady = fontsLoaded || !!fontError || fontsTimedOut;

  useEffect(() => {
    if (__DEV__ && fontsTimedOut && !fontsLoaded && !fontError) {
      console.warn("[veya] Fonts didn't load in time — continuing with system fonts.");
    }
  }, [fontError, fontsLoaded, fontsTimedOut]);

  // Keep the splash screen up until fonts resolve (a load error falls back to system fonts).
  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.veya.background }}>
      <StatusBar style="light" />
      {appConfig.clerkKeyStatus === "valid" ? (
        // tokenCache keeps the Clerk session in expo-secure-store (encrypted) across launches.
        <ClerkProvider publishableKey={appConfig.clerkPublishableKey} tokenCache={tokenCache}>
          <RootNavigator />
        </ClerkProvider>
      ) : (
        // A missing or malformed key would crash inside ClerkProvider; explain it instead.
        <SetupRequiredScreen reason={appConfig.clerkKeyStatus} onReady={hideSplash} />
      )}
    </GestureHandlerRootView>
  );
}

/**
 * Routes are gated declaratively: onboarding → auth → app. When a guard flips
 * (e.g. sign-in completes), Expo Router moves to the first allowed screen.
 */
function RootNavigator() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const hydrated = useStoresHydrated();
  const onboardingComplete = usePreferencesStore((state) => state.onboardingComplete);
  const introPending = usePreferencesStore((state) => state.introPending);
  const rememberSession = useSessionStore((state) => state.rememberSession);
  const timedOut = useTimedOut(BOOT_TIMEOUT_MS);

  // "Remember for 30 days" unticked: a session restored at launch is ended.
  // Checked once per launch, so signing in later in this launch isn't affected.
  const [launchChecked, setLaunchChecked] = useState(false);
  const [themeRestartFailed, setThemeRestartFailed] = useState(false);
  const onThemeRestartFailed = useCallback(() => setThemeRestartFailed(true), []);
  const endRestoredSession = isSignedIn === true && !rememberSession;
  useEffect(() => {
    if (launchChecked || !isLoaded || !hydrated) return;
    const check = endRestoredSession ? signOut() : Promise.resolve();
    check.catch(() => undefined).finally(() => setLaunchChecked(true));
  }, [endRestoredSession, hydrated, isLoaded, launchChecked, signOut]);

  const ready = isLoaded && hydrated && launchChecked;

  useEffect(() => {
    if (ready || timedOut) hideSplash();
    if (timedOut && !ready && __DEV__) {
      console.warn(`[veya] Startup still waiting — account service loaded: ${isLoaded}, saved data loaded: ${hydrated}`);
    }
  }, [hydrated, isLoaded, ready, timedOut]);

  if (!ready) {
    // Keep the native splash up briefly; if startup stalls, explain what's pending.
    return timedOut ? (
      <BootStatusScreen
        steps={[
          { label: "Saved data", done: hydrated },
          { label: "Account service", done: isLoaded },
        ]}
      />
    ) : null;
  }

  const signedIn = isSignedIn === true;
  // The user's theme is for the signed-in app; onboarding and sign-in stay Violet.
  // On sign-in or sign-out this run may be in the wrong theme: show nothing while it
  // restarts (if the restart fails, carry on in the current colours).
  if (themeForSession(signedIn) !== ACTIVE_THEME && !themeRestartFailed) {
    return <ThemeSync signedIn={signedIn} onRestartFailed={onThemeRestartFailed} />;
  }

  return (
    <>
      <ThemeSync signedIn={signedIn} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.veya.background },
          animation: "fade",
        }}
      >
        <Stack.Screen name="index" />
        {/* Google / Apple browser redirect target; it immediately returns to "/". */}
        <Stack.Screen name="sso-callback" />
        {/* Onboarding comes first for new users, or on every launch in development. */}
        <Stack.Protected guard={introPending || (!signedIn && !onboardingComplete)}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!introPending && !signedIn && onboardingComplete}>
          <Stack.Screen name="auth" />
          <Stack.Screen name="sign-up" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="forgot-password" options={{ animation: "slide_from_right" }} />
        </Stack.Protected>
        <Stack.Protected guard={!introPending && signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Keeps the colour theme in step with sign-in (renders nothing). */
function ThemeSync({ signedIn, onRestartFailed }: { signedIn: boolean; onRestartFailed?: () => void }) {
  useEffect(() => {
    syncThemeWithSession(signedIn).catch(() => onRestartFailed?.());
  }, [onRestartFailed, signedIn]);
  return null;
}
