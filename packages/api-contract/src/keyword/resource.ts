import {
  automatedResponseModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const publicKeywordResource = createSelectSchema(
  automatedResponseModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    folderId: z.string().nullable(),
    flowId: z.string().nullable(),
  },
)
export type PublicKeywordResource = z.infer<typeof publicKeywordResource>

export const publicListKeywordsResponse = z.object({
  data: z.array(publicKeywordResource),
})
export type PublicListKeywordsResponse = z.infer<
  typeof publicListKeywordsResponse
>
