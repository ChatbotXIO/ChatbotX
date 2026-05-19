import { z } from "zod"

export const aiMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  messageId: z.string().optional(),
  createdAt: z.number().int().optional(),
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
  summary: z.string().max(1000).default(""),
  history: z.array(aiMessageSchema).default([]),
  summarizing: z.boolean().default(false),
  needsResummarize: z.boolean().default(false),
  updatedAt: z.number().default(() => Date.now()),
})

export type AIContext = z.infer<typeof aiContextSchema>
export type AIMessage = z.infer<typeof aiMessageSchema>
