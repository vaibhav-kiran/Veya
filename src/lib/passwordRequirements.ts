import { useEffect, useState } from "react";

import { appConfig } from "./config";

/** The password policy configured in the Clerk Dashboard (User & authentication → Password). */
export type PasswordRequirements = {
  minLength: number;
  /** 0 means no maximum. */
  maxLength: number;
  requireNumbers: boolean;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireSpecialChar: boolean;
  allowedSpecialCharacters: string;
  /** Clerk rejects passwords found in known data breaches. */
  rejectsBreached: boolean;
};

/** Clerk's defaults, used if the instance settings can't be loaded. */
const FALLBACK: PasswordRequirements = {
  minLength: 8,
  maxLength: 0,
  requireNumbers: false,
  requireUppercase: false,
  requireLowercase: false,
  requireSpecialChar: false,
  allowedSpecialCharacters: "",
  rejectsBreached: true,
};

type PasswordSettingsJSON = {
  min_length?: number;
  max_length?: number;
  require_numbers?: boolean;
  require_uppercase?: boolean;
  require_lowercase?: boolean;
  require_special_char?: boolean;
  allowed_special_characters?: string;
  disable_hibp?: boolean;
};

/** Clerk's Frontend API host is encoded in the publishable key (base64, ending in "$"). */
function frontendApiHost(): string | null {
  const encoded = appConfig.clerkPublishableKey.split("_")[2];
  if (!encoded) return null;
  try {
    return atob(encoded).replace(/\$$/, "");
  } catch {
    return null;
  }
}

let pending: Promise<PasswordRequirements> | null = null;

/**
 * Loads the instance's password policy from Clerk's public environment
 * endpoint (the same settings Clerk's own sign-up form uses). Cached per launch.
 */
export function loadPasswordRequirements(): Promise<PasswordRequirements> {
  if (pending) return pending;
  const host = frontendApiHost();
  if (!host) return Promise.resolve(FALLBACK);

  pending = fetch(`https://${host}/v1/environment?_is_native=1`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<{ user_settings?: { password_settings?: PasswordSettingsJSON } }>;
    })
    .then(({ user_settings }) => {
      const settings = user_settings?.password_settings ?? {};
      return {
        minLength: settings.min_length || FALLBACK.minLength,
        maxLength: settings.max_length ?? 0,
        requireNumbers: !!settings.require_numbers,
        requireUppercase: !!settings.require_uppercase,
        requireLowercase: !!settings.require_lowercase,
        requireSpecialChar: !!settings.require_special_char,
        allowedSpecialCharacters: settings.allowed_special_characters ?? "",
        rejectsBreached: !settings.disable_hibp,
      };
    })
    .catch((error: unknown) => {
      if (__DEV__) console.warn("[veya] Couldn't load Clerk password settings, using defaults:", error);
      pending = null; // Try again next time.
      return FALLBACK;
    });
  return pending;
}

/** The Clerk password policy, or null while it loads. */
export function usePasswordRequirements(): PasswordRequirements | null {
  const [requirements, setRequirements] = useState<PasswordRequirements | null>(null);
  useEffect(() => {
    let active = true;
    void loadPasswordRequirements().then((loaded) => {
      if (active) setRequirements(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return requirements;
}

export type PasswordCheck = { key: string; label: string; met: boolean };

/** One line per rule Clerk enforces, each marked met / not yet met for `value`. */
export function checkPassword(value: string, rules: PasswordRequirements): PasswordCheck[] {
  const checks: PasswordCheck[] = [
    { key: "min", label: `At least ${rules.minLength} characters`, met: value.length >= rules.minLength },
  ];
  if (rules.maxLength > 0) {
    checks.push({ key: "max", label: `No more than ${rules.maxLength} characters`, met: value.length <= rules.maxLength });
  }
  if (rules.requireLowercase) checks.push({ key: "lower", label: "A lowercase letter", met: /[a-z]/.test(value) });
  if (rules.requireUppercase) checks.push({ key: "upper", label: "An uppercase letter", met: /[A-Z]/.test(value) });
  if (rules.requireNumbers) checks.push({ key: "number", label: "A number", met: /\d/.test(value) });
  if (rules.requireSpecialChar) {
    const special = rules.allowedSpecialCharacters
      ? [...rules.allowedSpecialCharacters].some((char) => value.includes(char))
      : /[^A-Za-z0-9]/.test(value);
    checks.push({ key: "special", label: "A symbol, like ! @ # $", met: special });
  }
  return checks;
}
