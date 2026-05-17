import {
  contactNoteModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"

export const contactNoteResource = createSelectSchema(contactNoteModel, {
  id: zodBigintAsString(),
  contactId: zodBigintAsString(),
  createdById: zodBigintAsString().nullable(),
})
