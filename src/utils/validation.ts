const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  return null;
}

/**
 * Only checks that a password was entered. Length and strength rules live in
 * the Clerk Dashboard, and Clerk's error message states them exactly.
 */
export function validatePassword(value: string): string | null {
  if (!value) return "Enter your password.";
  return null;
}

export function validateCode(value: string): string | null {
  if (!/^\d{6}$/.test(value.trim())) return "Enter the 6-digit code from your email.";
  return null;
}

