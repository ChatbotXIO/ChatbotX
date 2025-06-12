import type { ContactNote } from "@ahachat.ai/database/types"

export type ContactNoteResource = ContactNote

export type ContactNoteCollection = {
  data: ContactNoteResource[]
}
