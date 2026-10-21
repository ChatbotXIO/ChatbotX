import { contactService } from "../contact/service"
import { languageFromLocale } from "../contact-locale"
import {
  type CustomerMessageLanguage,
  customerMessageLanguage,
} from "./customer-messages"

/** The language a contact's bot messages go out in ("vi_VN" → "vi"). */
export const resolveContactMessageLanguage = async (input: {
  workspaceId: string
  contactId: string | null
}): Promise<CustomerMessageLanguage> => {
  if (!input.contactId) {
    return customerMessageLanguage(null)
  }
  const contact = await contactService.findById({
    workspaceId: input.workspaceId,
    id: input.contactId,
  })
  return customerMessageLanguage(
    contact?.locale ? languageFromLocale(contact.locale) : null,
  )
}
