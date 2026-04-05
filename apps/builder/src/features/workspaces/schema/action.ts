import z from "zod"

export const updateWorkspaceTokenRequest = z.object({
  token: z.string(),
})
export type UpdateWorkspaceTokenRequest = z.infer<
  typeof updateWorkspaceTokenRequest
>
