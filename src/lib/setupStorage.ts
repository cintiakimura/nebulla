/**
 * One-time setup state. Persisted in localStorage.
 * In production would sync to user account / encrypted vault.
 */
import { isOpenMode } from "./auth";

const KEY_COMPLETE = "kyn_setup_complete";
const KEY_SUPABASE = "kyn_supabase_creds";
const KEY_SERVICES = "kyn_connected_services";
const KEY_DOMAIN_VERIFIED = "kyn_domain_verified";
const KEY_STRIPE = "kyn_stripe_key";
const KEY_SECRETS = "kyn_secrets";
const KEY_PROFILE = "kyn_profile";

export type ConnectedServices = {
  github: boolean;
  supabase: boolean;
  vercel: boolean;
  stripe: boolean;
  domainVerified: boolean;
};

export function getSetupComplete(): boolean {
  if (typeof window === "undefined") return false;
  // Open mode: treat as complete so Builder/Grok work without running the setup wizard.
  if (isOpenMode()) return true;
  return localStorage.getItem(KEY_COMPLETE) === "true";
}

export function setSetupComplete(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_COMPLETE, "true");
}

export function getSupabaseCreds(): { url: string; anonKey: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_SUPABASE);
    if (!raw) return null;
    return JSON.parse(atob(raw)) as { url: string; anonKey: string };
  } catch {
    return null;
  }
}

/** Store Supabase URL + anon key (base64; production would use encrypted vault). */
export function setSupabaseCreds(url: string, anonKey: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_SUPABASE, btoa(JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() })));
}

export function getConnectedServices(): ConnectedServices {
  if (typeof window === "undefined") {
    return { github: false, supabase: false, vercel: false, stripe: false, domainVerified: false };
  }
  try {
    const raw = localStorage.getItem(KEY_SERVICES);
    const base = raw ? JSON.parse(raw) : {};
    return {
      github: !!base.github,
      supabase: !!base.supabase,
      vercel: !!base.vercel,
      stripe: !!base.stripe,
      domainVerified: getDomainVerified(),
    };
  } catch {
    return { github: false, supabase: false, vercel: false, stripe: false, domainVerified: false };
  }
}

export function setConnectedService(
  service: keyof Omit<ConnectedServices, "domainVerified">,
  connected: boolean
): void {
  if (typeof window === "undefined") return;
  const cur = getConnectedServices();
  const next = { ...cur, [service]: connected };
  localStorage.setItem(KEY_SERVICES, JSON.stringify(next));
}

function getDomainVerified(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY_DOMAIN_VERIFIED) === "true";
}

export function setDomainVerified(verified: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_DOMAIN_VERIFIED, verified ? "true" : "false");
}

export function getStripeKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY_STRIPE) ?? "";
}

export function setStripeKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_STRIPE, key.trim());
  const cur = getConnectedServices();
  setConnectedService("stripe", key.trim().length > 0);
}

export function getSecrets(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY_SECRETS);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function setSecrets(secrets: Record<string, string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_SECRETS, JSON.stringify(secrets));
}

export function setSecret(key: string, value: string): void {
  const k = key.trim();
  if (!k) return;
  const next = { ...getSecrets(), [k]: value.trim() };
  setSecrets(next);
}

export function removeSecret(key: string): void {
  const cur = getSecrets();
  const next = { ...cur };
  delete next[key];
  setSecrets(next);
}

export type Profile = { displayName?: string; email?: string; prefs?: { theme?: string } };

export function getProfile(): Profile {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY_PROFILE);
    if (!raw) return {};
    return JSON.parse(raw) as Profile;
  } catch {
    return {};
  }
}

export function setProfile(profile: Profile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_PROFILE, JSON.stringify(profile));
}
