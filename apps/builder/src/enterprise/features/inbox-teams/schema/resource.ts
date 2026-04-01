import {
  createSelectSchema,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import type z from "zod"

export const inboxTeamResource = createSelectSchema(inboxTeamModel)
export type InboxTeamResource = z.infer<typeof inboxTeamResource>
