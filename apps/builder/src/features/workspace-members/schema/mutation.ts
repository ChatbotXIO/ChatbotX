import { workspaceMemberPermissionsSchema } from "@chatbotx.io/database/partials"
import { z } from "zod"

/**
 * Shared with the admin console's create-workspace-for-an-owner dialog
 * (`@/enterprise/features/admin-workspaces/schema`), which reuses this same
 * permission set for the members it attaches.
 */
export const workspaceMemberPermissionsRequest =
  workspaceMemberPermissionsSchema.refine(
    (val) => Object.values(val).some(Boolean),
    {
      message: "At least one permission must be selected.",
      path: ["permissions"],
    },
  )

export const inviteWorkspaceMemberRequest = z.object({
  permissions: workspaceMemberPermissionsRequest,
})
export type InviteWorkspaceMemberRequest = z.infer<
  typeof inviteWorkspaceMemberRequest
>

export const updateWorkspaceMemberRequest = inviteWorkspaceMemberRequest.extend(
  {
    notificationTypes: z.object({
      notifyAdmin: z.boolean(),
      newMessageToHuman: z.boolean(),
      newOrder: z.boolean(),
    }),
    notificationChannels: z.object({
      messenger: z.boolean(),
      email: z.boolean(),
      telegram: z.boolean(),
      browser: z.boolean(),
    }),
  },
)
export type UpdateWorkspaceMemberRequest = z.infer<
  typeof updateWorkspaceMemberRequest
>
