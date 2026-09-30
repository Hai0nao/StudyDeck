import { z } from "zod";

export const CardListSchema = z.object({
  title: z.string(),
  cards: z.array(z.object({ term: z.string(), definition: z.string() })),
});

export type CardList = z.infer<typeof CardListSchema>;

/** JSON Schema for providers without a Zod helper (OpenAI). */
export const CARD_LIST_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: { term: { type: "string" }, definition: { type: "string" } },
        required: ["term", "definition"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "cards"],
  additionalProperties: false,
} as const;
