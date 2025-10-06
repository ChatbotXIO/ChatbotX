import type {
  ContactCustomFieldModel,
  ContactModel,
} from "@aha.chat/database/types"
import type { ConversationResource } from "@/features/conversations/schemas"
import { BaseException } from "@/lib/errors/exception"

export class ContactException extends BaseException {}

export type ContactResource = ContactModel & {
  fullName?: string
  avatarUrl?: string | null
  contactCustomFields?: ContactCustomFieldModel[]
  conversation?: ConversationResource | null
}

export type ContactCollection = {
  data: ContactResource[]
  pageCount: number
}
