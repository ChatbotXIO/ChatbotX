import type { ConversationModel } from "@aha.chat/database/types"
import type { BaseCursorCollection } from "@/features/common/schemas/pagination"
import type { ContactResource } from "@/features/contacts/schemas"
import type { InboxTeamResource } from "@/features/inbox-teams/schemas/types"
import type { InboxResource } from "@/features/inboxes/schemas"
import type { MessageResource } from "@/features/messages/schemas"
import type { UserResource } from "@/features/users/schemas"

export type ConversationResource = ConversationModel & {
  messages?: MessageResource[]
  contact?: ContactResource & {
    fullName: string
  }
  inbox?: InboxResource
  assignedUser?: UserResource | null
  assignedInboxTeam?: InboxTeamResource | null
  _count?: {
    messages?: number
  }
}

export type ConversationCollection = BaseCursorCollection<ConversationResource>
