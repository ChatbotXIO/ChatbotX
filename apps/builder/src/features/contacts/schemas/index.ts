import type {
  ContactCustomFieldModel,
  ContactModel,
} from "@aha.chat/database/types"
import type { ConversationResource } from "@/features/conversations/schemas"
import { BaseException } from "@/lib/error"

export class ContactException extends BaseException {}

export type ContactResource = ContactModel & {
  fullName?: string
  contactCustomFields?: ContactCustomFieldModel[]
  conversation?: ConversationResource | null
}

export type ContactCollection = {
  data: ContactResource[]
  pageCount: number
}
