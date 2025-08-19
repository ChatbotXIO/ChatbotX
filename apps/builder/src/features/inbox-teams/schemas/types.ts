import type {
  InboxTeamMemberModel,
  InboxTeamModel,
} from "@aha.chat/database/types"
import type { UserResource } from "@/features/users/schemas"

export type InboxTeamResource = InboxTeamModel & {
  _count?: {
    inboxTeamMembers?: number
  }
  inboxTeamMembers?: InboxTeamMemberResource[]
}

export type InboxTeamCollection = {
  data: InboxTeamResource[]
}

export type InboxTeamMemberResource = InboxTeamMemberModel & {
  user: UserResource
}
