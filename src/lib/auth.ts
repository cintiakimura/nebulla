/**
 * Client-side auth: get or create userId and persist for API calls.
 */
const KEY_USER_ID = "kyn_user_id";

export async function getUserId(): Promise<string> {
  if (typeof window === "undefined") return "";
  let userId = localStorage.getItem(KEY_USER_ID);
  if (userId) return userId;
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = (await res.json()) as { userId?: string };
  userId = data.userId ?? crypto.randomUUID();
  localStorage.setItem(KEY_USER_ID, userId);
  return userId;
}

export function setUserIdAfterLogin(userId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_USER_ID, userId);
}

export function clearUserId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_USER_ID);
}

const KEY_PAID = "kyn_paid";
const KEY_PLAN = "kyn_plan";

export function getPaidStatus(): { paid: boolean; plan?: string } {
  if (typeof window === "undefined") return { paid: false };
  const paid = localStorage.getItem(KEY_PAID) === "true";
  const plan = localStorage.getItem(KEY_PLAN) ?? undefined;
  return { paid, plan: plan || undefined };
}

export function setPaidFromSuccess(plan: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_PAID, "true");
  localStorage.setItem(KEY_PLAN, plan);
}
