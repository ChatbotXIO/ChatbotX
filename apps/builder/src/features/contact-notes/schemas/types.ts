import type { ContactNoteModel } from "@ahachat.ai/database/types"

export type ContactNoteResource = ContactNoteModel

export type ContactNoteCollection = {
  data: ContactNoteResource[]
}
