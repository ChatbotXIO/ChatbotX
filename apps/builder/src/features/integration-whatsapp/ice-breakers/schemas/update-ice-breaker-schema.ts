import { z } from "zod"

export const updateIceBreakerSchema = z.object({
  prompts: z.array(z.string().min(1).max(80).trim()).max(4),
})
export type UpdateIceBreakerSchema = z.infer<typeof updateIceBreakerSchema>
