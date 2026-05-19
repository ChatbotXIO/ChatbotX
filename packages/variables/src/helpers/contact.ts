import {
  contactInboxService,
  contactNoteService,
  tagService,
} from "@chatbotx.io/business"

export const listContactTagsString = async (
  contactId: string,
): Promise<string> => {
  const tags = await tagService.listByContactId({
    contactId,
  })
  return tags.map((tag) => tag.name).join(", ")
}

export const findPrimaryContactChannel = async (
  contactId: string,
): Promise<string | null> => {
  const contactInbox = await contactInboxService.findRecentByContactId({
    contactId,
  })
  if (!contactInbox) {
    return null
  }
  return contactInbox.channel
}

export const listContactNotesString = async (
  contactId: string,
): Promise<string> => {
  const contactNotes = await contactNoteService.listByContactId({
    contactId,
  })
  return contactNotes.map((note) => note.text).join("\n")
}

export const getLatestContactNoteString = async (
  contactId: string,
): Promise<string | null> => {
  const notes = await contactNoteService.listByContactId({ contactId })
  return notes[0]?.text ?? null
}
