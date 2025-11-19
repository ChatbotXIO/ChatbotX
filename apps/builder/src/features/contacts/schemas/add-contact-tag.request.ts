import { z } from "zod"

export const addContactTagRequest = z.object({
  ids: z.array(z.cuid2()),
  tags: z.array(z.string().trim().min(1)).min(1),
})
export type AddContactTagRequest = z.infer<typeof addContactTagRequest>
