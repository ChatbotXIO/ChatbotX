import type { ConversationResource } from "@/features/conversations/schemas"
import { BaseException } from "@/lib/error"
import type {
  ContactModel,
  ContactCustomFieldModel,
} from "@aha.chat/database/types"

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
