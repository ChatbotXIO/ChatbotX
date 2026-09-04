import {
  workspaceApiTokenPermissions,
  workspaceApiTokenScopes,
} from "@chatbotx.io/database/partials"
import z from "zod"

// Forces an explicit scope choice on create: either `allScopes: true` (stores
// NULL — unrestricted) or a non-empty `scopes` array. Submitting neither (or
// an empty scopes array while allScopes is false) is a validation error — no
// silent full-access default.
export const createWorkspaceTokenRequest = z
  .object({
    name: z.string().min(1).max(100),
    permission: workspaceApiTokenPermissions,
    allScopes: z.boolean(),
    scopes: z.array(workspaceApiTokenScopes),
  })
  .refine((data) => data.allScopes || data.scopes.length > 0, {
    message: "Select at least one scope, or choose All scopes",
    path: ["scopes"],
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
