import { z } from "zod"

export const createFlowSchema = z.object({
  title: z.string().min(1).max(255).trim(),
})
export type CreateFlowSchema = z.infer<typeof createFlowSchema>

export const createFlowBindSchema: [
  chatbotId: z.ZodString,
  folderId: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateFlowBindSchema = [chatbotId: string, folderId: string | null]
