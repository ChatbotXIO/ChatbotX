import type { UserResource } from "@/features/users/schemas"
import type { InboxTeam, InboxTeamMember } from "@ahachat.ai/database/types"

export type InboxTeamResource = InboxTeam & {
  _count?: {
    inboxTeamMembers?: number
  }
  inboxTeamMembers?: InboxTeamMemberResource[]
}

export type InboxTeamCollection = {
  data: InboxTeamResource[]
}

export type InboxTeamMemberResource = InboxTeamMember & {
  user: UserResource
}
