import { z } from "zod"

export const addNotesNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  message: z.string().min(1).max(1000).trim(),
})

export type AddNotesNodeSchema = z.infer<typeof addNotesNodeSchema>
