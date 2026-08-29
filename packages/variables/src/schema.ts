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

export type BotFieldValue = {
  type: CustomFieldType
  value: string | null
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
  /**
   * Workspace-level Account Fields (Bot Fields), keyed by id — matches the
   * `bot_field:<id>` reference token (see `@chatbotx.io/flow-config`'s
   * `parseFieldReference`). Optional so the many test fixtures and call
   * sites built before Account Fields existed keep type-checking; a missing
   * map simply means no `bot_field:` tokens resolve, same as an empty one.
   * `contactVariableService.getAll` always populates it in production.
   */
  botFieldsMap?: Map<string, BotFieldValue>
}
