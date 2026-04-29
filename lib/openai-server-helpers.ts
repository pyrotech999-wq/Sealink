/** OpenAI-compatible chat completions URL (supports OPENAI_BASE_URL override). */
export function openAiChatCompletionsUrl(): string {
  const raw = process.env.OPENAI_BASE_URL?.trim();
  const base = raw ? raw.replace(/\/$/, "") : "https://api.openai.com/v1";
  return `${base}/chat/completions`;
}

export async function parseOpenAiErrorBody(res: Response): Promise<string> {
  const errText = await res.text();
  try {
    const j = JSON.parse(errText) as { error?: { message?: string } };
    if (typeof j.error?.message === "string" && j.error.message.trim()) {
      return j.error.message.trim();
    }
  } catch {
    /* use raw */
  }
  return errText.slice(0, 500);
}
