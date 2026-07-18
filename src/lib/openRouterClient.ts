const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;
// Auto-routes to whichever free model is actually available right now — more
// resilient than pinning one model, since individual free models get
// congested/rate-limited or delisted on their own schedule.
const DEFAULT_MODEL = "openrouter/free";

export type ChatMessage = { role: "system" | "user"; content: string };

type OpenRouterResult = { success: true; content: string } | { success: false; error: string };

// Thin wrapper around OpenRouter's OpenAI-compatible chat completions endpoint.
// Never throws — callers on the free tier need to treat rate limits, network
// errors and delisted models as routine, not exceptional, so every failure
// collapses to { success: false } for a silent fallback upstream.
export async function callOpenRouter(messages: ChatMessage[]): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { success: false, error: "OPENROUTER_API_KEY is not set" };

  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hired.app",
        "X-Title": "Hired.",
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      return { success: false, error: `OpenRouter request failed with status ${res.status}` };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { success: false, error: "Empty response from OpenRouter" };
    }

    return { success: true, content };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  } finally {
    clearTimeout(timeout);
  }
}
