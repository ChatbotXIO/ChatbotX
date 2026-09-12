import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createFbCommentRequest, updateFbCommentRequest } from "./action"
import { fbCommentResource } from "./resource"

export const listFbCommentsPublicRequest = publicListRequest.extend({
  name: z.string().nullish(),
  folderId: zodBigintAsString().nullish(),
  isActive: z.boolean().nullish(),
})

export const fbCommentPublicResource = fbCommentResource.omit({
  workspaceId: true,
})

export const listFbCommentsPublicResponse = publicListResponse(
  fbCommentPublicResource,
)

export const createFbCommentPublicRequest = createFbCommentRequest

export const updateFbCommentPublicRequest = updateFbCommentRequest.and(
  z.object({ id: zodBigintAsString() }),
)

export const deleteFbCommentPublicRequest = z.object({
  id: zodBigintAsString(),
})
