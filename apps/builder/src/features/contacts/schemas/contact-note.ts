import { contactNoteModel, createSelectSchema } from "@aha.chat/database/schema"

export const contactNoteResource = createSelectSchema(contactNoteModel)
