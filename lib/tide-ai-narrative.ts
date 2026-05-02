import { openAiChatCompletionsUrl } from "@/lib/openai-server-helpers";

export type TideFact = { kind: "high" | "low"; t: string; heightM: number | null; sourceNote?: string };

/** One or two sentences rephrasing supplied tide facts only (no invented times or heights). */
export async function tideFactsNarrative(args: {
  placeLabel: string;
  timeZone: string;
  facts: TideFact[];
}): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || args.facts.length < 1) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const body = {
    model,
    temperature: 0.2,
    max_tokens: 180,
    messages: [
      {
        role: "system" as const,
        content: `You help a UK-focused boating app. You MUST only use tide events from the user's JSON facts. Never invent, estimate, or web-search tide times or heights. If a height is null, mention time only for that row. British English. At most two sentences. Name the place once.`,
      },
      {
        role: "user" as const,
        content: `Place: ${args.placeLabel}
Display times in: ${args.timeZone}
Use only these tide extremes (ISO times UTC; heights in metres where present):
${JSON.stringify(args.facts.slice(0, 10))}

Summarise the next high and low waters for roughly the next 24 hours from now using only these rows.`,
      },
    ],
  };

  try {
    const res = await fetch(openAiChatCompletionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = j.choices?.[0]?.message?.content?.trim();
    return text && text.length > 10 ? text : null;
  } catch {
    return null;
  }
}
