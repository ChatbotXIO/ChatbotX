import {
  workspaceMemberNotificationChannelsSchema,
  workspaceMemberNotificationTypesSchema,
  workspaceMemberPermissionsSchema,
} from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const workspaceMemberResource = createSelectSchema(
  workspaceMemberModel,
  {
    id: z.string(),
    userId: z.string(),
    workspaceId: z.string(),
  },
).extend({
  permissions: workspaceMemberPermissionsSchema,
  notificationTypes: workspaceMemberNotificationTypesSchema,
  notificationChannels: workspaceMemberNotificationChannelsSchema,
})
export type WorkspaceMemberResource = z.infer<typeof workspaceMemberResource>
