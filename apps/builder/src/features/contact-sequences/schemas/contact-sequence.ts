import { z } from "zod"

export const updateContactSequenceRequest = z.object({
  contactId: z.cuid2(),
  sequences: z.array(z.string().trim()),
})
export type UpdateContactSequenceRequest = z.infer<
  typeof updateContactSequenceRequest
>
