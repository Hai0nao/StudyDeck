export type AiSource = "words" | "text";
export type AiStyle = "en" | "ipa" | "collocations" | "vi" | "qa" | "custom";

export const STYLE_LABELS: Record<AiStyle, string> = {
  en: "English definition",
  ipa: "IPA + definition + example",
  collocations: "Definition + collocations",
  vi: "Vietnamese meaning",
  qa: "Question → answer",
  custom: "Only my instructions",
};

const STYLE_RULES: Record<AiStyle, string> = {
  en: "Front: the word or phrase itself. Back: a plain English learner's definition (around CEFR B1, at most 20 words), starting with the part of speech in brackets, e.g. (v.).",
  ipa: "Front: the word or phrase itself. Back: British IPA in /…/, then a short English definition, then one natural example sentence, separated by • .",
  collocations:
    "Front: the word or phrase itself. Back: a short English definition, then 2-3 common collocations or a typical phrase, separated by • .",
  vi: "Front: the word or phrase itself. Back: a concise, natural Vietnamese meaning, starting with the abbreviated part of speech (n., v., adj.).",
  qa: "Front: a short, specific question that tests one idea. Back: the answer in at most 25 words.",
  custom: "Follow the user's instructions for what goes on each side.",
};

export interface AiRequest {
  source: AiSource;
  input: string;
  style: AiStyle;
  instructions: string;
}

export function systemPrompt(req: AiRequest): string {
  const task =
    req.source === "words"
      ? "Create exactly ONE card per word or phrase in the list, in the given order. Never add words that are not in the list."
      : "Read the text and pick out the vocabulary, terms or facts most worth memorising (usually 10-30 cards). Skip trivial words.";
  return [
    "You write flashcards for a personal study app.",
    task,
    STYLE_RULES[req.style],
    "If the user gives extra instructions, they take priority over the style above.",
    "Keep each side under 220 characters. No markdown and no numbering inside cards.",
    "Also suggest a short set title (at most 8 words).",
  ].join("\n");
}

export function userPrompt(req: AiRequest): string {
  const label = req.source === "words" ? "Word list" : "Text";
  const extra = req.instructions.trim() ? `\n\nExtra instructions: ${req.instructions.trim()}` : "";
  return `${label}:\n${req.input.trim()}${extra}`;
}

/**
 * Prompt to paste into claude.ai / chatgpt.com when no API key is set.
 * It asks for a JSON block that `parseAiReply` understands.
 */
export function chatPrompt(req: AiRequest): string {
  return [
    systemPrompt(req),
    "",
    "Reply with ONLY one JSON code block in exactly this shape:",
    '{"title": "…", "cards": [{"term": "…", "definition": "…"}]}',
    "",
    userPrompt(req),
  ].join("\n");
}
