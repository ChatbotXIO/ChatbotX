import { z } from "zod"

export const aiMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  messageId: z.string().optional(),
  createdAt: z.number().int().optional(),
  // Monotonic per-conversation append order, assigned once when the message
  // is actually pushed into `history[]` (see `aiContextSchema.nextSeq`).
  // Unlike `messageId` (which can fall back to a content hash and therefore
  // collide between distinct messages with identical role/content/createdAt),
  // `seq` is always unique — it's the authoritative identity for telling two
  // history entries apart. Optional only for backward-compat with contexts
  // cached before this field existed (24h Redis TTL).
  seq: z.number().int().optional(),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        z.object({ type: z.literal("text"), text: z.string() }),
        z.object({
          type: z.literal("image"),
          image: z.string(),
          mimeType: z.string().optional(),
        }),
      ]),
    ),
  ]),
})

export const aiContextSchema = z.object({
  markerMessageId: z.string().nullable().default(null),
  summary: z.string().max(1000).default(""),
  history: z.array(aiMessageSchema).default([]),
  // Next `seq` value to assign to a newly-appended history entry. Always
  // `>= history.length`; kept as an explicit counter (not re-derived from
  // history length) so `seq` stays unique even across truncation/removal.
  nextSeq: z.number().int().default(0),
  summarizing: z.boolean().default(false),
  // Set alongside `summarizing: true`; lets a summarize job self-heal from a
  // worker crash that left `summarizing` stuck true with no process left to
  // clear it (see `handleSummarizeConversation`'s stale-lock check).
  summarizingStartedAt: z.number().nullable().default(null),
  needsResummarize: z.boolean().default(false),
  updatedAt: z.number().default(() => Date.now()),
})

export type AIContext = z.infer<typeof aiContextSchema>
export type AIMessage = z.infer<typeof aiMessageSchema>
