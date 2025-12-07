import { z } from "zod"

export const addContactNotesRequest = z.object({
  contactId: z.cuid2(),
  content: z.string().trim().min(1).max(1000),
})
export type AddContactNotesRequest = z.infer<typeof addContactNotesRequest>

export const updateContactNotesRequest = z.object({
  content: z.string().trim().min(1).max(1000),
})
export type UpdateContactNotesRequest = z.infer<
  typeof updateContactNotesRequest
>
