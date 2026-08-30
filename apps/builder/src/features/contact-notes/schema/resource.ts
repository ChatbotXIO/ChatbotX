import {
  contactNoteModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import type { ContactNoteModel, UserModel } from "@chatbotx.io/database/types"
import z from "zod"

export const contactNoteResource = createSelectSchema(contactNoteModel, {
  id: z.string(),
  contactId: z.string(),
  createdById: z.string().nullable(),
})
export type ContactNoteResource = ContactNoteModel & {
  createdBy?: UserModel | null
}
