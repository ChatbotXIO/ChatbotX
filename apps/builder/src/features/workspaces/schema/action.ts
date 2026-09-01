import { workspaceApiTokenPermissions } from "@chatbotx.io/database/partials"
import z from "zod"

export const createWorkspaceTokenRequest = z.object({
  name: z.string().min(1).max(100),
  permission: workspaceApiTokenPermissions,
})
export type CreateWorkspaceTokenRequest = z.infer<
  typeof createWorkspaceTokenRequest
>

export const deleteWorkspaceTokenRequest = z.object({
  id: z.string().min(1),
})
export type DeleteWorkspaceTokenRequest = z.infer<
  typeof deleteWorkspaceTokenRequest
>
