import {
  createSelectSchema,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const inboxTeamResource = createSelectSchema(inboxTeamModel, {
  id: z.string(),
  workspaceId: z.string(),
})
export type InboxTeamResource = z.infer<typeof inboxTeamResource>
