import { CARD_LIST_JSON_SCHEMA, CardListSchema, type CardList } from "./schema";

export async function generateWithOpenAI(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<CardList> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "flashcards", strict: true, schema: CARD_LIST_JSON_SCHEMA },
        },
      }),
    });
  } catch {
    throw new Error("Could not reach api.openai.com.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Invalid OpenAI API key.");
    throw new Error(body?.error?.message || `OpenAI error ${res.status}`);
  }
  const choice = body?.choices?.[0];
  if (choice?.message?.refusal) throw new Error(choice.message.refusal);
  if (choice?.finish_reason === "length") {
    throw new Error("The list is too long for one request — split it into smaller batches.");
  }
  return CardListSchema.parse(JSON.parse(choice?.message?.content ?? "{}"));
}
