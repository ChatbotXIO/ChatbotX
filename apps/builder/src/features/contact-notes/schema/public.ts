import { z } from "zod"
import { contactNoteResource } from "@/features/contact-notes/schema/resource"
import { addContactNoteRequest } from "./action"

export const listContactNotesPublicResponse = z.object({
  data: z.array(contactNoteResource),
})

export const addContactNotePublicRequest = addContactNoteRequest
export type AddContactNotePublicRequest = z.infer<
  typeof addContactNotePublicRequest
>

export const updateContactNotePublicRequest = addContactNotePublicRequest
export type UpdateContactNotePublicRequest = z.infer<
  typeof updateContactNotePublicRequest
>
