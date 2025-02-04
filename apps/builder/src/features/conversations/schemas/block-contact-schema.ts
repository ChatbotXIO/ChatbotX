import { z } from "zod"

export const blockContactSchema = z.object({
  ids: z.array(z.string().cuid2()),
})
export type BlockContactSchema = z.infer<typeof blockContactSchema>
