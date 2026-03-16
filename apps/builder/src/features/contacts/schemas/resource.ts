import { contactModel, createSelectSchema } from "@aha.chat/database/schema"
import type {
  ContactCustomFieldModel,
  ContactModel,
  ContactNoteModel,
  ContactsOnSequenceModel,
  CustomFieldType,
  SequenceModel,
  TagModel,
} from "@aha.chat/database/types"
import type { LucideIcon } from "lucide-react"
import type { ConversationResource } from "@/features/conversations/schemas/resource"

export type ContactResource = ContactModel & {
  contactCustomFields?: ContactCustomFieldModel[]
  tags?: TagModel[]
  sequences?: SequenceModel[]
  contactsOnSequences?: (ContactsOnSequenceModel & {
    sequence: SequenceModel
  })[]
  contactNotes?: ContactNoteModel[]
  conversation?: ConversationResource | null
}

export type ContactCollection = {
  data: ContactResource[]
  pageCount: number
}

// Base schema for validation
export const contactResource = createSelectSchema(contactModel)

export type ContactEditableField = {
  key: string
  icon: LucideIcon
  label: string
  value: string | null | undefined
  type: CustomFieldType
}

export const publicContactResource = contactResource.pick({
  id: true,
  phoneNumber: true,
  email: true,
  firstName: true,
  lastName: true,
  gender: true,
  source: true,
  sourceId: true,
})
