import type {
  InboxTeamMemberModel,
  InboxTeamModel,
} from "@aha.chat/database/types"
import type { UserResource } from "@/features/users/schemas/resource"

export type InboxTeamResource = InboxTeamModel & {
  inboxTeamMembers?: InboxTeamMemberResource[]
}

export type InboxTeamMemberResource = InboxTeamMemberModel & {
  user?: UserResource | null
}
