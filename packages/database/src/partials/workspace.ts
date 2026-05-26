import { z } from "zod"

export const workspaceMemberRoles = z.enum(["owner", "manager", "agent"])
export type WorkspaceMemberRole = z.infer<typeof workspaceMemberRoles>

export const contactVisibilityModes = z.enum(["all", "team", "self"])
export type ContactVisibilityMode = z.infer<typeof contactVisibilityModes>

export const workspaceMemberPermissionsSchema = z.object({
  restrictDataExport: z.boolean().default(false),
  restrictContactDeletion: z.boolean().default(false),
  restrictWorkspaceSettings: z.boolean().default(false),
  restrictIntegrationSettings: z.boolean().default(false),
  contactVisibility: contactVisibilityModes.default("all"),
  restrictCalling: z.boolean().default(false),
  restrictWorkflows: z.boolean().default(false),
  maskPhoneAndEmail: z.boolean().default(false),
})
export type WorkspaceMemberPermissions = z.infer<
  typeof workspaceMemberPermissionsSchema
>

export const defaultWorkspaceMemberPermissions: WorkspaceMemberPermissions = {
  restrictDataExport: false,
  restrictContactDeletion: false,
  restrictWorkspaceSettings: false,
  restrictIntegrationSettings: false,
  contactVisibility: "all",
  restrictCalling: false,
  restrictWorkflows: false,
  maskPhoneAndEmail: false,
}

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
