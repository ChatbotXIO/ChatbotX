import { z } from "zod"

export const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(255),
})
export type UpdateTagSchema = z.input<typeof updateTagSchema>

export const updateTagBindSchema: [z.ZodCUID2, z.ZodCUID2] = [
  z.cuid2(),
  z.cuid2(),
]
export type UpdateTagBindSchema = [string, string]
