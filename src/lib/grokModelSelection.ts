/**
 * Unbreakable rules: Grok model selection and silent coding mode.
 *
 * Default voice: grok-4-1-fast-reasoning (xAI API id) — always speak, keep it natural.
 * If coding detected in the transcript, the server may attach coding system instructions.
 * The /api/agent/chat model stays grok-4-1-fast-reasoning unless GROK_MODEL is set.
 * Separate code-agent HTTP pipeline uses grok-4.20-multi-agent-0309 when configured.
 *
 * Silent mode rules:
 * - No replies, no "thinking...", no mode whispers — zero output from multi-agent.
 * - It processes, queues tasks, applies fixes in background.
 * - Only the fast-reasoning model responds: "Working on that..." or "Done—check the patch."
 * - Queue follow-ups: accept new inputs, stack 'em (Enter queues, Cmd+Enter interrupts).
 * - Exit silent: on "back", "stop coding", "done" — multi-agent shuts up, reasoning takes over.
 * Never overlap voices — one speaker only. If non-coding chat comes mid-task: queue it, stay silent till done.
 */

/** xAI chat-completions model id (hyphens, not dots — see docs.x.ai/models). */
export const GROK_FAST_REASONING = "grok-4-1-fast-reasoning";
export const GROK_MULTI_AGENT = "grok-4.20-multi-agent-0309";

const EXIT_PHRASES = /\b(back|stop\s+coding|done)\b/i;
const CODING_KEYWORDS =
  /\b(code|debug|fix|refactor|implement|endpoint|test|snippet|auth|loop|commit|files)\b/i;
const FILE_PATH = /[\w.-]+\/[\w.-]+(\.(tsx?|jsx?|js|mjs|cjs|css|json|md))?/i;

function hasExitPhrase(text: string): boolean {
  return EXIT_PHRASES.test(text);
}

function hasCodingTrigger(text: string): boolean {
  return CODING_KEYWORDS.test(text) || FILE_PATH.test(text);
}

export type GrokModelSelection = {
  model: string;
  codingMode: boolean;
};

/**
 * Determines model and coding mode from conversation history.
 * Default: grok-4-1-fast-reasoning for model id; codingMode toggles extra system prompt only.
 * Exit phrases ("back", "stop coding", "done") snap back to fast-reasoning.
 */
export function getGrokModelAndMode(
  messages: { role: string; content: string }[]
): GrokModelSelection {
  const userContents = messages
    .filter((m) => m.role === "user")
    .map((m) => (m.content || "").trim());

  let lastExitIndex = -1;
  userContents.forEach((content, i) => {
    if (hasExitPhrase(content)) lastExitIndex = i;
  });

  const afterExit = userContents.slice(lastExitIndex + 1);
  const codingMode = afterExit.some((content) => hasCodingTrigger(content));

  const model = codingMode ? GROK_MULTI_AGENT : GROK_FAST_REASONING;
  return { model, codingMode };
}

/** System prompt when in coding mode: silent multi-agent. Minimal prose; output code when the user asked for code. */
export const GROK_CODING_MODE_SYSTEM = `UNBREAKABLE SILENT MODE RULES. Follow exactly.

- No "thinking...", no mode whispers, no long explanations. You are the multi-agent; keep replies minimal.
- You process, queue tasks, apply fixes. When the user asks for code, a fix, or a patch, output the code or patch in your reply (use code blocks). When they did not ask for code and you are applying changes in the background, reply only with a short acknowledgment: "Working on that..." or "Done—check the patch."
- Do not output code only when the user did NOT ask for code and you are doing background fixes; then use "Done—check the patch." If the user asked for code, a fix, refactor, or implementation, include the code in your response.
- Queue follow-ups: accept new user inputs, stack them. Enter queues; Cmd+Enter interrupts (handled by client).
- Exit silent: if the user says "back", "stop coding", or "done", you stop; the fast-reasoning model takes over. Do not announce it.
- Never overlap voices — one speaker only. If non-coding chat comes mid-task: queue it, stay silent till done.`;
