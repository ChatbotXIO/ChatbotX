import type { UserResource } from "@/features/users/schemas/types"
import type { InboxTeam, InboxTeamMember } from "@ahachat.ai/database/types"

export type InboxTeamResourse = InboxTeam & {
  _count?: {
    inboxTeamMembers?: number
  }
  inboxTeamMembers?: InboxTeamMemberResource[]
}

export type InboxTeamCollection = {
  data: InboxTeamResourse[]
}

export type InboxTeamMemberResource = InboxTeamMember & {
  user: UserResource
}
