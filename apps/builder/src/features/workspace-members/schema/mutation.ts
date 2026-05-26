import { workspaceMemberPermissionsSchema } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const inviteWorkspaceMemberRequest = z.object({
  email: z.string().email().max(255),
  role: z.enum(["manager", "agent"]),
  permissions: workspaceMemberPermissionsSchema,
})
export type InviteWorkspaceMemberRequest = z.infer<
  typeof inviteWorkspaceMemberRequest
>

export const updateWorkspaceMemberRequest = z.object({
  role: z.enum(["owner", "manager", "agent"]),
  permissions: workspaceMemberPermissionsSchema,
  notificationTypes: z
    .object({
      notifyAdmin: z.boolean(),
      newMessageToHuman: z.boolean(),
      newOrder: z.boolean(),
    })
    .optional(),
  notificationChannels: z
    .object({
      messenger: z.boolean(),
      email: z.boolean(),
      telegram: z.boolean(),
      browser: z.boolean(),
    })
    .optional(),
})
export type UpdateWorkspaceMemberRequest = z.infer<
  typeof updateWorkspaceMemberRequest
>
