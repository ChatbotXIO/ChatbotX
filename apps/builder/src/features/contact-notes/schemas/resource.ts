import type { ContactNoteModel, UserModel } from "@chatbotx.io/database/types"

export type ContactNoteResource = ContactNoteModel & {
  createdBy?: UserModel | null
}
