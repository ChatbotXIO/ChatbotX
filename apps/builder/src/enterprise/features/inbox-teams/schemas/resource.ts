import { createSelectSchema, inboxTeamModel } from "@aha.chat/database/schema"
import type {
  InboxTeamMemberModel,
  InboxTeamModel,
} from "@aha.chat/database/types"
import type { UserResource } from "@/features/users/schemas/resource"

export const inboxTeamResource = createSelectSchema(inboxTeamModel)

export type InboxTeamResource = InboxTeamModel & {
  inboxTeamMembers?: InboxTeamMemberResource[]
}

export type InboxTeamMemberResource = InboxTeamMemberModel & {
  user?: UserResource | null
}
