import { z } from "zod"

export const addContactNoteRequest = z.object({
  content: z.string().trim().min(1).max(1000),
})
export type AddContactNoteRequest = z.infer<typeof addContactNoteRequest>

export const updateContactNoteRequest = addContactNoteRequest.partial().extend({
  contactNoteId: z.cuid2(),
})
export type UpdateContactNoteRequest = z.infer<typeof updateContactNoteRequest>

export const deleteContactNoteRequest = z.object({
  id: z.cuid2(),
})
export type DeleteContactNoteRequest = z.infer<typeof deleteContactNoteRequest>
