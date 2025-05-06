import { z } from "zod"

export const updateIceBreakerSchema = z.object({
  prompts: z.array(z.string()),
})
export type UpdateIceBreakerSchema = z.infer<typeof updateIceBreakerSchema>
