import {
  chatbotMemberNotificationChannelsSchema,
  chatbotMemberNotificationTypesSchema,
  chatbotMemberPermissionsSchema,
} from "@chatbotx.io/database/partials"
import {
  chatbotMemberModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import type { z } from "zod"

export const chatbotMemberResource = createSelectSchema(
  chatbotMemberModel,
).extend({
  permissions: chatbotMemberPermissionsSchema,
  notificationTypes: chatbotMemberNotificationTypesSchema,
  notificationChannels: chatbotMemberNotificationChannelsSchema,
})
export type ChatbotMemberResource = z.infer<typeof chatbotMemberResource>
