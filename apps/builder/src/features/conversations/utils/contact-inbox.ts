/** The conversation's contact inbox on `channel`, if the contact is reachable there. */
export const findContactInboxByChannel = <
  TContactInbox extends { channel: string },
>(
  conversation: { contactInboxes: TContactInbox[] } | null | undefined,
  channel: TContactInbox["channel"],
): TContactInbox | undefined =>
  conversation?.contactInboxes.find(
    (contactInbox) => contactInbox.channel === channel,
  )
