import { z } from "zod"

export const updateTagSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type UpdateTagSchema = z.infer<typeof updateTagSchema>

export const updateTagBindSchema: [chatbotId: z.ZodString, tagId: z.ZodString] =
  [z.string().cuid2(), z.string().cuid2()]

export type UpdateTagBindSchema = [chatbotId: string, tagId: string]
