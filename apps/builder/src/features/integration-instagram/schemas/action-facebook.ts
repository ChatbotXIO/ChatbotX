import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

export const selectFacebookAccountRequest = z.object({
  workspaceId: zodBigintAsString().nullish(),
  igId: z.string(),
  igName: z.string(),
  igUsername: z.string(),
  pageId: z.string(),
  pageAccessToken: z.string(),
  version: z.string().optional(),
})
export type SelectFacebookAccountRequest = z.infer<
  typeof selectFacebookAccountRequest
>
