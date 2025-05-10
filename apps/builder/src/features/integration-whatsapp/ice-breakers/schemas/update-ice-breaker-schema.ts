import { z } from "zod"

export const updateWhatsappIceBreakerSchema = z.object({
  prompts: z.array(z.string()),
})
export type UpdateWhatsappIceBreakerSchema = z.infer<
  typeof updateWhatsappIceBreakerSchema
>
