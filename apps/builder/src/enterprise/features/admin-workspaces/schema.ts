import { z } from "zod"
import { workspaceMemberPermissionsRequest } from "@/features/workspace-members/schema/mutation"

export const MAX_ADMIN_WORKSPACE_MEMBERS = 20

export const createAdminWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  ownerEmail: z.email().trim().toLowerCase(),
  memberEmails: z
    .array(z.email().trim().toLowerCase())
    .max(MAX_ADMIN_WORKSPACE_MEMBERS)
    .default([]),
  permissions: workspaceMemberPermissionsRequest,
})
