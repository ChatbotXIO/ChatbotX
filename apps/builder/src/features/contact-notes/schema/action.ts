import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const addContactNoteRequest = z.object({
  text: z.string().trim().min(1).max(1000),
})
export type AddContactNoteRequest = z.infer<typeof addContactNoteRequest>

export const updateContactNoteRequest = addContactNoteRequest.partial().extend({
  contactNoteId: zodBigintAsString(),
})
export type UpdateContactNoteRequest = z.infer<typeof updateContactNoteRequest>

export const deleteContactNoteRequest = z.object({
  contactNoteId: zodBigintAsString(),
})
export type DeleteContactNoteRequest = z.infer<typeof deleteContactNoteRequest>
