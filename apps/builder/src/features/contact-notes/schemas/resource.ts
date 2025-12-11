import type { ContactNoteModel, UserModel } from "@aha.chat/database/types"

export type ContactNoteResource = ContactNoteModel & {
  createdBy?: UserModel
}

export type ContactNoteCollection = {
  data: ContactNoteResource[]
}
