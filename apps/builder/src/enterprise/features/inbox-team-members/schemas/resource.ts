import {
  createSelectSchema,
  inboxTeamMemberModel,
} from "@chatbotx.io/database/schema"
import type z from "zod"

export const inboxTeamMemberResource = createSelectSchema(inboxTeamMemberModel)
export type InboxTeamMemberResource = z.infer<typeof inboxTeamMemberResource>
