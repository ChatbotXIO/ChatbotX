import {
  contactNoteModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"

export const contactNoteResource = createSelectSchema(contactNoteModel)
