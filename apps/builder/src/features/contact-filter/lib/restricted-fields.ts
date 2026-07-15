import {
  type ContactFilterField,
  contactFilterFields,
} from "@chatbotx.io/database/partials"
import { EMAIL_PHONE_FILTER_FIELDS } from "@chatbotx.io/database/queries/contact-filter/permission"

export const EMAIL_PHONE_RESTRICTED_FILTER_FIELDS = [
  ...EMAIL_PHONE_FILTER_FIELDS,
  contactFilterFields.enum.phoneWasVerified,
  contactFilterFields.enum.optedInForSms,
] as const satisfies readonly ContactFilterField[]
