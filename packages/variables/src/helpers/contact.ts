import {
  contactInboxService,
  contactNoteService,
  contactReferralEventService,
  tagService,
} from "@chatbotx.io/business"
import { CONTACT_AD_IDS_LIMIT } from "@chatbotx.io/database/partials"

export const listContactTagsString = async (
  contactId: string,
): Promise<string> => {
  const tags = await tagService.listByContactId({
    contactId,
  })
  return tags.map((tag) => tag.name).join(", ")
}

/**
 * The ad ids the contact arrived through, oldest first; null when none. Capped
 * at `CONTACT_AD_IDS_LIMIT`, so for a contact past it the newest are cut.
 */
export const listContactAdIdsString = async (
  contactId: string,
  workspaceId: string,
): Promise<string | null> => {
  const adIds = await contactReferralEventService.listAdIds({
    workspaceId,
    contactId,
    limit: CONTACT_AD_IDS_LIMIT,
  })
  return adIds.length > 0 ? adIds.join(", ") : null
}

/** The first ad the contact arrived through; null when none. */
export const getFirstContactAdId = async (
  contactId: string,
  workspaceId: string,
): Promise<string | null> => {
  const [adId] = await contactReferralEventService.listAdIds({
    workspaceId,
    contactId,
    limit: 1,
  })
  return adId ?? null
}

export const findPrimaryContactChannel = async (
  contactId: string,
  workspaceId: string,
): Promise<string | null> => {
  const contactInbox = await contactInboxService.findRecentByContactId({
    workspaceId,
    contactId,
  })
  if (!contactInbox) {
    return null
  }
  return contactInbox.channel
}

export const listContactNotesString = async (
  contactId: string,
  workspaceId: string,
): Promise<string> => {
  const contactNotes = await contactNoteService.listByContactId({
    workspaceId,
    contactId,
  })
  return contactNotes.map((note) => note.text).join("\n")
}

export const getLatestContactNoteString = async (
  contactId: string,
  workspaceId: string,
): Promise<string | null> => {
  const notes = await contactNoteService.listByContactId({
    workspaceId,
    contactId,
  })
  return notes[0]?.text ?? null
}
