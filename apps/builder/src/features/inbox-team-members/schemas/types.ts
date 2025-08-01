import type { InboxTeamMemberModel } from "@aha.chat/database/types"

export type InboxTeamMemberResource = InboxTeamMemberModel

export type InboxTeamMemberCollection = {
  data: InboxTeamMemberResource[]
}
