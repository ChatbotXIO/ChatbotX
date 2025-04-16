import { z } from "zod"

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(255),
  syncToMessenger: z.boolean(),
})
export type CreateTagSchema = z.infer<typeof createTagSchema>

export const createTagBindSchema: [
  chatbotId: z.ZodString,
  folderId: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateTagBindSchema = [chatbotId: string, folderId: string | null]
