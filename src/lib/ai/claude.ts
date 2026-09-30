import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CardListSchema, type CardList } from "./schema";

// Models that accept `output_config.effort` and the server-side refusal fallback.
const MODERN = /^claude-(opus-5|sonnet-5-5|fable)/;

export async function generateWithClaude(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<CardList> {
  // Personal app: the key is stored in this browser and only sent to api.anthropic.com.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const modern = MODERN.test(model);

  try {
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: {
        format: betaZodOutputFormat(CardListSchema),
        // Writing cards is a simple task; low effort keeps it fast and cheap.
        ...(modern ? { effort: "low" as const } : {}),
      },
      // If a safety classifier declines, the API retries on its recommended fallback model.
      ...(modern
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });

    if (res.stop_reason === "refusal") {
      throw new Error("Claude declined this request. Try rewording the input.");
    }
    if (res.stop_reason === "max_tokens") {
      throw new Error("The list is too long for one request — split it into smaller batches.");
    }
    if (!res.parsed_output) throw new Error("Claude's reply could not be read. Please try again.");
    return res.parsed_output;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      throw new Error("Invalid Claude API key.", { cause: e });
    if (e instanceof Anthropic.RateLimitError) {
      throw new Error("Rate limited by Anthropic — wait a moment and retry.", { cause: e });
    }
    if (e instanceof Anthropic.NotFoundError)
      throw new Error(`Model "${model}" was not found.`, { cause: e });
    if (e instanceof Anthropic.APIConnectionError) {
      throw new Error("Could not reach api.anthropic.com.", { cause: e });
    }
    if (e instanceof Anthropic.APIError) throw new Error(e.message, { cause: e });
    throw e;
  }
}
