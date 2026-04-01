import { z } from "zod"

export const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(255),
})
export type UpdateTagSchema = z.input<typeof updateTagSchema>
