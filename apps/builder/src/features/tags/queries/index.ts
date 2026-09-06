import { tagService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListTagsRequest, ListTagsResponse } from "../schema/query"
export const listTagsRSC = async (
  input: ListTagsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await listTags(input)
}
export const listTags = async (
  input: ListTagsRequest & { workspaceId: string },
): Promise<ListTagsResponse> => await tagService.list(input)
