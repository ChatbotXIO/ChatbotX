import {
  organizationMemberRoles,
  workspaceMemberRoles,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

export const workspaceAssignmentSchema = z.object({
  workspaceId: z.string().min(1),
  role: workspaceMemberRoles,
})
export type WorkspaceAssignment = z.infer<typeof workspaceAssignmentSchema>

export const upsertOrganizationUserSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  name: z.string().trim().max(100).optional().default(""),
  organizationRole: organizationMemberRoles,
  workspaceAssignments: z.array(workspaceAssignmentSchema).default([]),
})
export type UpsertOrganizationUserSchema = z.infer<
  typeof upsertOrganizationUserSchema
>

export const editOrganizationUserSchema = z.object({
  userId: z.string().min(1),
  organizationRole: organizationMemberRoles,
  workspaceAssignments: z.array(workspaceAssignmentSchema).default([]),
})
export type EditOrganizationUserSchema = z.infer<
  typeof editOrganizationUserSchema
>

export const deleteOrganizationUserSchema = z.object({
  userId: z.string().min(1),
})
export type DeleteOrganizationUserSchema = z.infer<
  typeof deleteOrganizationUserSchema
>
