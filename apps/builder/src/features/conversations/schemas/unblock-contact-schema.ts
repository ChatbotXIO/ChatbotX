import { z } from "zod"

export const unblockContactSchema = z.object({
  ids: z.array(z.string().cuid2()),
})
export type UnblockContactSchema = z.infer<typeof unblockContactSchema>
