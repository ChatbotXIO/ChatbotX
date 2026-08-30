import { tagService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListTagsRequest, ListTagsResponse } from "../schema/query"

export const listTagsRSC = async (
  input: ListTagsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await listTags(input)
}

export async function listTags(
  input: ListTagsRequest & { workspaceId: string },
): Promise<ListTagsResponse> {
  return await tagService.list(input)
}
