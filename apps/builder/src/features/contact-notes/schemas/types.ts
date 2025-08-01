import type { ContactNoteModel } from "@aha.chat/database/types"

export type ContactNoteResource = ContactNoteModel

export type ContactNoteCollection = {
  data: ContactNoteResource[]
}
