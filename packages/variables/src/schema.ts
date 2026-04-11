import type { CustomFieldType } from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"

export type ContactCustomFieldValue = {
  key: string
  type: CustomFieldType
  value: string
  description: string
}

export type ReplaceVariableProps = {
  contact: ContactModel
  customFieldsMap: Map<string, ContactCustomFieldValue>
}
