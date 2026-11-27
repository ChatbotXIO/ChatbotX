/**
 * Whether a `pipelineItemChanged` event concerns a contact's inbox panel: its
 * own items, a pipeline-wide change, or a publisher that sends no contact.
 */
export const concernsContact = (
  event: { contactId?: string },
  contactId: string,
): boolean => event.contactId === undefined || event.contactId === contactId
