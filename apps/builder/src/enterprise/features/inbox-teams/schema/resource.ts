import { createSelectSchema, inboxTeamModel } from "@aha.chat/database/schema"
import type z from "zod"

export const inboxTeamResource = createSelectSchema(inboxTeamModel)
export type InboxTeamResource = z.infer<typeof inboxTeamResource>
