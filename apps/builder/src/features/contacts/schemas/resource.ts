import type {
  ContactCustomFieldModel,
  ContactModel,
  ContactNoteModel,
  ConversationModel,
  CustomFieldType,
  InboxModel,
  InboxTeamModel,
  TagModel,
  UserModel,
} from "@aha.chat/database/types"
import type { LucideIcon } from "lucide-react"
import { BaseException } from "@/lib/errors/exception"

export class ContactException extends BaseException {}

export type ContactResource = ContactModel & {
  contactCustomFields?: ContactCustomFieldModel[]
  tags?: TagModel[]
  contactNotes?: ContactNoteModel[]
  conversation?:
    | (ConversationModel & {
        assignedUser?: UserModel | null
        assignedInboxTeam?: InboxTeamModel | null
        inbox?: InboxModel | null
      })
    | null
}

export type ContactEditableField = {
  key: string
  icon: LucideIcon
  label: string
  value: string | null | undefined
  customFieldType: CustomFieldType
}
