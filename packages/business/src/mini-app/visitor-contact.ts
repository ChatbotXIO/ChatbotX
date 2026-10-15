import { contactService } from "../contact/service"

/**
 * The contact a visitor's token names, if it still exists. The token may
 * outlive the contact: a deleted contact's visitor is anonymous (`null`).
 */
export const findVisitorContactId = async (input: {
  workspaceId: string
  contactId?: string | null
}): Promise<string | null> => {
  if (!input.contactId) {
    return null
  }
  const contact = await contactService.findById({
    workspaceId: input.workspaceId,
    id: input.contactId,
  })
  return contact?.id ?? null
}
