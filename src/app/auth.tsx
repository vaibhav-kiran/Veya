import { useSignIn } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View, type TextInputInstance } from "react-native";

import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { FormMessage } from "@/components/FormMessage";
import { SocialAuthButtons } from "@/components/SocialAuthButtons";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { describeAuthError } from "@/lib/authErrors";
import { haptics } from "@/lib/haptics";
import { useSessionStore } from "@/stores/sessionStore";
import { validateCode, validateEmail, validatePassword } from "@/utils/validation";

type Step = "credentials" | "verify";
type FieldErrors = { email?: string | null; password?: string | null; code?: string | null };

/**
 * Sign in with Clerk: email + password, then an emailed code when Clerk asks
 * for a second step (e.g. a new device). Google / Apple go through SSO.
 */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();
  const setRememberSession = useSessionStore((state) => state.setRememberSession);
  const passwordRef = useRef<TextInputInstance>(null);

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  const busy = submitting || ssoBusy || fetchStatus === "fetching";

  const fail = (message: string) => {
    haptics.error();
    setFormError(message);
  };

  /** Activate the session; the root guards then open the app from "/". */
  const complete = async () => {
    setRememberSession(remember);
    const finalized = await signIn.finalize();
    if (finalized.error) return fail(describeAuthError(finalized.error));
    haptics.success();
    router.replace("/");
  };

  const onSocialSignedIn = () => {
    setRememberSession(true);
    router.replace("/");
  };

  const sendSecondFactorCode = async () => {
    const sent = await signIn.mfa.sendEmailCode();
    if (sent.error) return fail(describeAuthError(sent.error));
    setNotice(`We sent a 6-digit code to ${email.trim()}.`);
    setCode("");
    setStep("verify");
  };

  const handleSignIn = async () => {
    if (busy) return;
    const errors = { email: validateEmail(email), password: validatePassword(password) };
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return haptics.error();

    setSubmitting(true);
    try {
      const result = await signIn.password({ emailAddress: email.trim(), password });
      if (result.error) return fail(describeAuthError(result.error));

      if (signIn.status === "complete") return await complete();
      if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") {
        const emailCode = signIn.supportedSecondFactors.some((factor) => factor.strategy === "email_code");
        if (emailCode) return await sendSecondFactorCode();
        return fail("This account uses a verification method the app doesn't support yet.");
      }
      fail("We couldn't finish signing you in. Please try again.");
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
      const verified = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (verified.error) return fail(describeAuthError(verified.error));
      if (signIn.status !== "complete") return fail("We couldn't verify that code. Please try again.");
      await complete();
    } catch (error) {
      fail(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (busy) return;
    setFormError(null);
    const sent = await signIn.mfa.sendEmailCode();
    if (sent.error) fail(describeAuthError(sent.error));
    else setNotice(`A new code is on its way to ${email.trim()}.`);
  };

  const backToCredentials = () => {
    void signIn.reset();
    setStep("credentials");
    setFormError(null);
    setFieldErrors({});
  };

  if (step === "verify") {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="Enter the code to confirm it's you."
        onBack={busy ? undefined : backToCredentials}
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
        <Button label="Verify" onPress={handleVerify} loading={submitting} disabled={busy} style={styles.submit} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Log in to your account"
      subtitle="Welcome back! Please enter your details."
      footer={<TextLink prefix="Don't have an account?" label="Sign up" onPress={() => router.push("/sign-up")} disabled={busy} />}
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
      />
      <TextField
        ref={passwordRef}
        label="Password"
        placeholder="Enter your password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: null }));
        }}
        error={fieldErrors.password}
        secureToggle
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleSignIn}
        editable={!busy}
      />
      <View style={styles.options}>
        <Checkbox label="Remember for 30 days" checked={remember} onChange={setRemember} />
        <TextLink
          label="Forgot password?"
          onPress={() => router.push({ pathname: "/forgot-password", params: email.trim() ? { email: email.trim() } : {} })}
          disabled={busy}
        />
      </View>
      <FormMessage message={formError} />
      <Button label="Sign in" onPress={handleSignIn} loading={submitting} disabled={busy} style={styles.submit} />
      <SocialAuthButtons disabled={busy} onBusyChange={setSsoBusy} onError={setFormError} onSignedIn={onSocialSignedIn} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -4 },
  submit: { marginTop: 4 },
});
