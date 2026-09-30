import { CardListSchema, type CardList } from "./schema";

export async function generateWithGemini(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<CardList> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      },
    );
  } catch {
    throw new Error("Could not reach Google's Gemini API.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Gemini error ${res.status}`);
  const text: string =
    body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
    "";
  if (!text) throw new Error("Gemini returned an empty reply. Please try again.");
  return CardListSchema.parse(JSON.parse(text));
}
