import z from "zod"

export const updateWorkspaceTokenRequest = z.object({
  token: z.string().min(1),
})
export type UpdateWorkspaceTokenRequest = z.infer<
  typeof updateWorkspaceTokenRequest
>
