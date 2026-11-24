type OriginInboxSource = {
  id: string
  inboxId: string
  channel: string
  inbox: { name: string }
}

export type OriginInbox = {
  contactInboxId: string
  inboxId: string
  channel: string
  name: string
}

/**
 * Page or phone name for the inbox a conversation last used.
 * The last message's contact inbox wins. One inbox and no last message
 * still names that inbox. Several inboxes and no matching message stay blank.
 */
export const resolveOriginInbox = (
  contactInboxes: readonly OriginInboxSource[],
  lastMessageContactInboxId?: string | null,
): OriginInbox | null => {
  const matched = lastMessageContactInboxId
    ? contactInboxes.find((row) => row.id === lastMessageContactInboxId)
    : undefined
  const chosen =
    matched ?? (contactInboxes.length === 1 ? contactInboxes[0] : undefined)
  const name = chosen?.inbox.name.trim()
  if (!chosen || !name) {
    return null
  }
  return {
    contactInboxId: chosen.id,
    inboxId: chosen.inboxId,
    channel: chosen.channel,
    name,
  }
}
