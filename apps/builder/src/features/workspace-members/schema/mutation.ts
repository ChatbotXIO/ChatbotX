import { z } from "zod"

export const inviteWorkspaceMemberRequest = z.object({
  permissions: z
    .object({
      superAdmin: z.boolean(),
      analytics: z.boolean(),
      flows: z.boolean(),
      contacts: z.boolean(),
      onlyAssignedContacts: z.boolean(),
      emailAndPhone: z.boolean(),
      broadcast: z.boolean(),
      ecommerce: z.boolean(),
    })
    .refine((val) => Object.values(val).some(Boolean), {
      message: "At least one permission must be selected.",
      path: ["permissions"],
    }),
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
