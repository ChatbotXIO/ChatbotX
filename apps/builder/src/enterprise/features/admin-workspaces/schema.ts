import { MAX_ADMIN_WORKSPACE_MEMBERS } from "@chatbotx.io/business/admin-workspace/constants"
import { z } from "zod"
import { workspaceMemberPermissionsRequest } from "@/features/workspace-members/schema/mutation"

export const createAdminWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  ownerEmail: z.email().trim().toLowerCase(),
  memberEmails: z
    .array(z.email().trim().toLowerCase())
    .max(MAX_ADMIN_WORKSPACE_MEMBERS)
    .default([]),
  permissions: workspaceMemberPermissionsRequest,
})
