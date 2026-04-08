import z from "zod"
import { chatbotResource } from "./resource"

export const updateWorkspaceTokenRequest = z.object({
  token: z.string(),
})
export type UpdateWorkspaceTokenRequest = z.infer<
  typeof updateWorkspaceTokenRequest
>

export const getWorkspacePublicResource = chatbotResource.omit({ token: true })
export type GetWorkspacePublicResource = z.infer<
  typeof getWorkspacePublicResource
>
