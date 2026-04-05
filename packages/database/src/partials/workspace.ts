import { z } from "zod"

export const workspaceMemberRoles = z.enum(["owner", "agent"])
export type WorkspaceMemberRole = z.infer<typeof workspaceMemberRoles>

export const workspaceMemberPermissionsSchema = z.object({
  superAdmin: z.boolean(),
  analytics: z.boolean(),
  flows: z.boolean(),
  contacts: z.boolean(),
  onlyAssignedContacts: z.boolean(),
  emailAndPhone: z.boolean(),
  broadcast: z.boolean(),
  ecommerce: z.boolean(),
})
export type WorkspaceMemberPermissions = z.infer<
  typeof workspaceMemberPermissionsSchema
>

export const workspaceMemberNotificationTypesSchema = z.object({
  notifyAdmin: z.boolean(),
  newMessageToHuman: z.boolean(),
  newOrder: z.boolean(),
})
export type WorkspaceMemberNotificationTypes = z.infer<
  typeof workspaceMemberNotificationTypesSchema
>

export const workspaceMemberNotificationChannelsSchema = z.object({
  messenger: z.boolean(),
  email: z.boolean(),
  telegram: z.boolean(),
  browser: z.boolean(),
})
export type WorkspaceMemberNotificationChannels = z.infer<
  typeof workspaceMemberNotificationChannelsSchema
>
