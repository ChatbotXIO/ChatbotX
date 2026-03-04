import type { ConversationModel } from "@aha.chat/database/types"
import type { InboxTeamResource } from "@/enterprise/features/inbox-teams/schemas/types"
import type { BaseCursorCollection } from "@/features/common/schemas/pagination"
import type { ContactResource } from "@/features/contacts/schemas/resource"
import type { InboxResource } from "@/features/inboxes/schemas/resource"
import type { MessageResource } from "@/features/messages/schemas"
import type { UserResource } from "@/features/users/schemas/resource"

export type ConversationResource = ConversationModel & {
  messages?: MessageResource[]
  contact?: ContactResource
  inbox?: InboxResource
  assignedUser?: UserResource | null
  assignedInboxTeam?: InboxTeamResource | null
  _count?: {
    messages?: number
  }
}

export type ConversationCollection = BaseCursorCollection<ConversationResource>
