import { useSignUp } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type TextInputInstance } from "react-native";

import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/Button";
import { FormMessage } from "@/components/FormMessage";
import { PasswordRequirementsList } from "@/components/PasswordRequirementsList";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { describeAuthError } from "@/lib/authErrors";
import { haptics } from "@/lib/haptics";
import { checkPassword, usePasswordRequirements } from "@/lib/passwordRequirements";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useSessionStore } from "@/stores/sessionStore";
import { validateCode, validateEmail, validatePassword } from "@/utils/validation";

type Step = "details" | "verify";
type FieldErrors = {
  email?: string | null;
  password?: string | null;
  code?: string | null;
};

/** Create a Clerk account with email + password, verified by an emailed 6-digit code. */
export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, fetchStatus } = useSignUp();
  const clearAuthEntry = usePreferencesStore((state) => state.clearAuthEntry);
  const setRememberSession = useSessionStore((state) => state.setRememberSession);
  const passwordRef = useRef<TextInputInstance>(null);

  const [step, setStep] = useState<Step>("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  const busy = submitting || ssoBusy || fetchStatus === "fetching";
  // Clerk's password policy from the Dashboard, shown as a live checklist.
  const requirements = usePasswordRequirements();
  const unmetRule = requirements ? checkPassword(password, requirements).find((check) => !check.met) : undefined;

  // Reached via onboarding's "Create Account": reset so later visits default to sign-in.
  useEffect(() => {
    clearAuthEntry();
  }, [clearAuthEntry]);

  // Sign-up may be opened straight from onboarding with nothing behind it.
  const toSignIn = () => (router.canGoBack() ? router.back() : router.replace("/auth"));

  const fail = (message: string) => {
    haptics.error();
    setFormError(message);
  };

  const signedIn = () => {
    setRememberSession(true);
    router.replace("/");
  };

  const handleCreate = async () => {
    if (busy) return;
    const errors = {
      email: validateEmail(email),
      password: validatePassword(password) ?? (unmetRule ? `Password needs: ${unmetRule.label.toLowerCase()}.` : null),
    };
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return haptics.error();

    setSubmitting(true);
    try {
      // Creates the user in Clerk (email + password are stored there, never on the device).
      const created = await signUp.password({
        emailAddress: email.trim(),
        password,
      });
      if (created.error) return fail(describeAuthError(created.error));

      // Clerk already created the account and a session: go straight into the app.
      if (signUp.status === "complete") {
        const finalized = await signUp.finalize();
        if (finalized.error) return fail(describeAuthError(finalized.error));
        haptics.success();
        return signedIn();
      }

      // Anything other than an unverified email (e.g. a required name) can't be finished here.
      if (!signUp.unverifiedFields.includes("email_address")) {
        return fail("Clerk needs more details to finish sign-up. Check the sign-up settings in the Clerk Dashboard.");
      }

      // The Clerk instance requires email verification before the account can be used.
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return fail(describeAuthError(sent.error));
      setNotice(`We sent a 6-digit code to ${email.trim()}.`);
      setCode("");
      setStep("verify");
    } catch (error) {
      fail(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (busy) return;
    const codeError = validateCode(code);
    setFieldErrors({ code: codeError });
    setFormError(null);
    if (codeError) return haptics.error();

    setSubmitting(true);
    try {
      const verified = await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      });
      if (verified.error) return fail(describeAuthError(verified.error));
      if (signUp.status !== "complete") {
        // e.g. the Clerk instance also requires a name or username at sign-up.
        return fail("Your email is verified, but Clerk needs more details to finish. Check the sign-up settings in the Clerk Dashboard.");
      }
      const finalized = await signUp.finalize();
      if (finalized.error) return fail(describeAuthError(finalized.error));
      haptics.success();
      signedIn();
    } catch (error) {
      fail(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (busy) return;
    setFormError(null);
    const sent = await signUp.verifications.sendEmailCode();
    if (sent.error) fail(describeAuthError(sent.error));
    else setNotice(`A new code is on its way to ${email.trim()}.`);
  };

  if (step === "verify") {
    return (
      <AuthLayout
        title="Verify your email"
        subtitle="One last step to create your account."
        onBack={
          busy
            ? undefined
            : () => {
                setStep("details");
                setFormError(null);
                setFieldErrors({});
              }
        }
        footer={<TextLink prefix="Didn't get it?" label="Resend code" onPress={resendCode} disabled={busy} />}
      >
        <FormMessage tone="info" message={notice} />
        <TextField
          label="Verification code"
          placeholder="6-digit code"
          value={code}
          onChangeText={(value) => {
            setCode(value);
            if (fieldErrors.code) setFieldErrors({});
          }}
          error={fieldErrors.code}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          returnKeyType="go"
          onSubmitEditing={handleVerify}
          editable={!busy}
          autoFocus
        />
        <FormMessage message={formError} />
        <Button label="Verify email" onPress={handleVerify} loading={submitting} disabled={busy} style={styles.submit} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Start turning your ideas into projects."
      footer={<TextLink prefix="Already have an account?" label="Log in" onPress={toSignIn} disabled={busy} />}
    >
      <TextField
        label="Email"
        placeholder="Enter your email"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: null }));
        }}
        error={fieldErrors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!busy}
        autoFocus
      />
      <TextField
        ref={passwordRef}
        label="Password"
        placeholder={requirements ? `At least ${requirements.minLength} characters` : "Create a password"}
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: null }));
        }}
        error={fieldErrors.password}
        secureToggle
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={handleCreate}
        editable={!busy}
      />
      {requirements ? <PasswordRequirementsList password={password} requirements={requirements} /> : null}
      <FormMessage message={formError} />
      <Button label="Create account" onPress={handleCreate} loading={submitting} disabled={busy} style={styles.submit} />
      <SocialAuthButtons disabled={busy} onBusyChange={setSsoBusy} onError={setFormError} onSignedIn={signedIn} />
      {/* Web only: Clerk mounts its bot-protection CAPTCHA here (skipped on iOS/Android). */}
      <View nativeID="clerk-captcha" />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: 4 },
});
