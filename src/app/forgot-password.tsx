import { useSignIn } from "@clerk/expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, type TextInputInstance } from "react-native";

import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/Button";
import { FormMessage } from "@/components/FormMessage";
import { PasswordRequirementsList } from "@/components/PasswordRequirementsList";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { describeAuthError } from "@/lib/authErrors";
import { haptics } from "@/lib/haptics";
import { checkPassword, usePasswordRequirements } from "@/lib/passwordRequirements";
import { useSessionStore } from "@/stores/sessionStore";
import { validateCode, validateEmail, validatePassword } from "@/utils/validation";

type Step = "email" | "reset";
type FieldErrors = {
  email?: string | null;
  code?: string | null;
  password?: string | null;
};

/** Password reset through Clerk: emailed code + new password, then signed straight in. */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { signIn, fetchStatus } = useSignIn();
  const setRememberSession = useSessionStore((state) => state.setRememberSession);
  const passwordRef = useRef<TextInputInstance>(null);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || fetchStatus === "fetching";
  // Clerk's password policy from the Dashboard, shown as a live checklist.
  const requirements = usePasswordRequirements();
  const unmetRule = requirements ? checkPassword(password, requirements).find((check) => !check.met) : undefined;

  const back = () => (router.canGoBack() ? router.back() : router.replace("/auth"));

  const fail = (message: string) => {
    haptics.error();
    setFormError(message);
  };

  const sendCode = async () => {
    if (busy) return;
    const emailError = validateEmail(email);
    setFieldErrors({ email: emailError });
    setFormError(null);
    if (emailError) return haptics.error();

    setSubmitting(true);
    try {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) return fail(describeAuthError(created.error));
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) return fail(describeAuthError(sent.error));
      setStep("reset");
    } catch (error) {
      fail(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (busy) return;
    const errors = {
      code: validateCode(code),
      password: validatePassword(password) ?? (unmetRule ? `Password needs: ${unmetRule.label.toLowerCase()}.` : null),
    };
    setFieldErrors(errors);
    setFormError(null);
    if (errors.code || errors.password) return haptics.error();

    setSubmitting(true);
    try {
      const verified = await signIn.resetPasswordEmailCode.verifyCode({
        code: code.trim(),
      });
      if (verified.error) return fail(describeAuthError(verified.error));
      const submitted = await signIn.resetPasswordEmailCode.submitPassword({
        password,
      });
      if (submitted.error) return fail(describeAuthError(submitted.error));
      if (signIn.status !== "complete") {
        haptics.success();
        return back(); // Password changed; Clerk wants a fresh sign-in.
      }
      setRememberSession(true);
      const finalized = await signIn.finalize();
      if (finalized.error) return fail(describeAuthError(finalized.error));
      haptics.success();
      router.replace("/");
    } catch (error) {
      fail(describeAuthError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (busy) return;
    setFormError(null);
    const sent = await signIn.resetPasswordEmailCode.sendCode();
    if (sent.error) fail(describeAuthError(sent.error));
  };

  if (step === "reset") {
    return (
      <AuthLayout
        title="Choose a new password"
        subtitle={`Enter the code we sent to ${email.trim()}.`}
        onBack={busy ? undefined : () => setStep("email")}
        footer={<TextLink prefix="Didn't get it?" label="Resend code" onPress={resendCode} disabled={busy} />}
      >
        <TextField
          label="Verification code"
          placeholder="6-digit code"
          value={code}
          onChangeText={setCode}
          error={fieldErrors.code}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!busy}
          autoFocus
        />
        <TextField
          ref={passwordRef}
          label="New password"
          placeholder={requirements ? `At least ${requirements.minLength} characters` : "Create a new password"}
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          secureToggle
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={resetPassword}
          editable={!busy}
        />
        {requirements ? <PasswordRequirementsList password={password} requirements={requirements} /> : null}
        <FormMessage message={formError} />
        <Button label="Reset and sign in" onPress={resetPassword} loading={submitting} disabled={busy} style={styles.submit} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot password?"
      subtitle="No worries — we'll email you a reset code."
      onBack={back}
      footer={<TextLink prefix="Remembered it?" label="Log in" onPress={back} disabled={busy} />}
    >
      <TextField
        label="Email"
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={sendCode}
        editable={!busy}
        autoFocus={!params.email}
      />
      <FormMessage message={formError} />
      <Button label="Send reset code" onPress={sendCode} loading={submitting} disabled={busy} style={styles.submit} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: 4 },
});
