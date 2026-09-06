import { z } from "zod"
import { contactNoteResource } from "@/features/contact-notes/schema/resource"

export const listContactNotesPublicResponse = z.object({
  data: z.array(contactNoteResource),
})

export const addContactNotePublicRequest = z.object({
  text: z.string().trim().min(1).max(1000),
})
export type AddContactNotePublicRequest = z.infer<
  typeof addContactNotePublicRequest
>

export const updateContactNotePublicRequest = z.object({
  text: z.string().trim().min(1).max(1000),
})
