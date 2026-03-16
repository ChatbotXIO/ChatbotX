import { z } from "zod"

export const updateSequenceSchema = z.object({
  name: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
})

export type UpdateSequenceSchema = z.infer<typeof updateSequenceSchema>
