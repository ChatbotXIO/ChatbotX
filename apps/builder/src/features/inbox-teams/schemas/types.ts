import type { UserResource } from "@/features/users/schemas"
import type {
  InboxTeamModel,
  InboxTeamMemberModel,
} from "@ahachat.ai/database/types"

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
