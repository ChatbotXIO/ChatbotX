import type { CustomFieldType } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"

export type ContactCustomFieldValue = {
  key: string
  type: CustomFieldType
  value: string
  description: string
}

export type ContactVariableContext = {
  contact: ContactModel
  contactInbox: ContactInboxModel | null
  conversation?: ConversationModel | null
  appointmentId?: string
  workspace: WorkspaceModel | null
}

export type ReplaceVariableProps = ContactVariableContext & {
  customFieldsMap: Map<string, ContactCustomFieldValue>
}
