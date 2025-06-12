import type { ConversationResource } from "@/features/conversations/schemas"
import { BaseException } from "@/lib/error"
import type { Contact, ContactCustomField } from "@ahachat.ai/database/types"

export class ContactException extends BaseException {}

export type ContactResource = Contact & {
  fullName?: string
  contactCustomFields?: ContactCustomField[]
  conversation?: ConversationResource | null
}

export type ContactCollection = {
  data: ContactResource[]
  pageCount: number
}
