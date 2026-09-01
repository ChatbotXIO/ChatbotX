import { z } from "zod"

export const updateWhatsappIceBreakerSchema = z.object({
  prompts: z.array(
    z.object({
      value: z.string().min(1).max(60),
    }),
  ),
})
export type UpdateWhatsappIceBreakerSchema = z.infer<
  typeof updateWhatsappIceBreakerSchema
>
