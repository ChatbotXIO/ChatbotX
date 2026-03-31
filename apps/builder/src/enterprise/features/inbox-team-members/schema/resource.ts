import {
  createSelectSchema,
  inboxTeamMemberModel,
} from "@aha.chat/database/schema"
import type z from "zod"

export const inboxTeamMemberResource = createSelectSchema(inboxTeamMemberModel)
export type InboxTeamMemberResource = z.infer<typeof inboxTeamMemberResource>
