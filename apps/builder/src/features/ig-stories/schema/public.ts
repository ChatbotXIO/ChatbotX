import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createIgStoryRequest, updateIgStoryRequest } from "./action"
import { igStoryResource } from "./resource"

export const listIgStoriesPublicRequest = publicListRequest.extend({
  name: z.string().nullish(),
  folderId: zodBigintAsString().nullish(),
  isActive: z.boolean().nullish(),
})
export const igStoryPublicResource = igStoryResource.omit({
  workspaceId: true,
})
export const listIgStoriesPublicResponse = publicListResponse(
  igStoryPublicResource,
)
export const createIgStoryPublicRequest = createIgStoryRequest
export const updateIgStoryPublicRequest = updateIgStoryRequest.and(
  z.object({ id: zodBigintAsString() }),
)
