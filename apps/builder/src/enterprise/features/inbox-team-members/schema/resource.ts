import {
  createSelectSchema,
  inboxTeamMemberModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const inboxTeamMemberResource = createSelectSchema(
  inboxTeamMemberModel,
  {
    id: z.string(),
    inboxTeamId: z.string(),
  },
)
export type InboxTeamMemberResource = z.infer<typeof inboxTeamMemberResource>
