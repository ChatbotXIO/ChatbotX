import { contactVariableService } from "@chatbotx.io/variables"

/** Renders `text` for a contact exactly like a flow message would. */
export const renderForContact = async (input: {
  contactId: string
  contactInboxId: string | null
  text: string
  sentByUserId?: string
  appointmentId?: string
}): Promise<string> => {
  const variables = await contactVariableService.getAll({
    contactId: input.contactId,
    contactInbox: input.contactInboxId,
    sentByUserId: input.sentByUserId,
    appointmentId: input.appointmentId,
  })
  return await contactVariableService.replaceAll({
    text: input.text,
    variables,
  })
}
