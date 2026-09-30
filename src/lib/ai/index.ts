import type { Provider, Settings } from "@/store/types";
import type { RawCard } from "../parse";
import { systemPrompt, userPrompt, type AiRequest } from "./prompt";
import type { CardList } from "./schema";

export * from "./prompt";

export const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
};

export const DEFAULT_MODELS: Record<Provider, string> = {
  claude: "claude-opus-5-5",
  openai: "gpt-5",
  gemini: "gemini-flash-latest",
};

export const MODEL_SUGGESTIONS: Record<Provider, string[]> = {
  claude: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"],
  openai: ["gpt-5", "gpt-5-mini"],
  gemini: ["gemini-flash-latest", "gemini-pro-latest"],
};

export const KEY_HELP: Record<Provider, string> = {
  claude: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
};

export const CHAT_URLS = {
  claude: "https://claude.ai/new",
  openai: "https://chatgpt.com/",
} as const;

export function hasKey(ai: Settings["ai"]): boolean {
  return !!ai.keys[ai.provider]?.trim();
}

type Generator = (key: string, model: string, system: string, user: string) => Promise<CardList>;

// Provider SDKs are loaded on demand so they stay out of the main bundle.
async function loadGenerator(provider: Provider): Promise<Generator> {
  if (provider === "claude") return (await import("./claude")).generateWithClaude;
  if (provider === "openai") return (await import("./openai")).generateWithOpenAI;
  return (await import("./gemini")).generateWithGemini;
}

export async function generateCards(
  ai: Settings["ai"],
  req: AiRequest,
): Promise<{ title: string; cards: RawCard[] }> {
  const key = ai.keys[ai.provider]?.trim();
  if (!key) throw new Error(`Add a ${PROVIDER_LABELS[ai.provider]} API key in Settings first.`);
  const model = ai.models[ai.provider]?.trim() || DEFAULT_MODELS[ai.provider];
  const run = await loadGenerator(ai.provider);
  const out = await run(key, model, systemPrompt(req), userPrompt(req));
  const cards = out.cards
    .map((c) => ({ term: c.term.trim(), def: c.definition.trim() }))
    .filter((c) => c.term && c.def);
  if (!cards.length) throw new Error("The AI returned no cards. Try rewording your input.");
  return { title: out.title.trim(), cards };
}
