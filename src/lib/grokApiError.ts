/**
 * Normalize xAI / Grok error bodies and add a short user-facing hint when the key lacks model permissions.
 */

export type GrokChatErrorBody = {
  error: string;
  details: string;
  hint?: string;
};

export function buildGrokChatErrorBody(errText: string): GrokChatErrorBody {
  let details = errText.slice(0, 600);
  try {
    const parsed = JSON.parse(errText) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof parsed?.error === "string") {
      details = parsed.error;
    } else if (parsed?.error && typeof parsed.error === "object" && "message" in parsed.error) {
      details = String((parsed.error as { message?: string }).message ?? details);
    } else if (typeof parsed?.message === "string") {
      details = parsed.message;
    }
  } catch {
    /* keep slice */
  }

  const lower = details.toLowerCase();
  let hint: string | undefined;
  if (
    lower.includes("permission") ||
    lower.includes("lacks the permissions") ||
    (lower.includes("api key") && lower.includes("cannot be used"))
  ) {
    hint =
      "Open https://console.x.ai → API keys → edit this key → enable the models you need (e.g. grok-4-1-fast-reasoning). Or set GROK_MODEL in server env to a model your key is allowed to use, then redeploy.";
  }

  return { error: "Grok API error", details, ...(hint ? { hint } : {}) };
}

/** Append server hint to assistant-facing error string. */
export function formatGrokErrorForChat(
  data: {
    error?: string;
    details?: string;
    hint?: string;
  },
  fallback = "Service down—try later"
): string {
  const base =
    data.error && data.details ? `${data.error}: ${data.details}` : data.error || data.details || fallback;
  return data.hint ? `${base}\n\n${data.hint}` : base;
}
