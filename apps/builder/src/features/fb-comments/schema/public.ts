import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createFbCommentRequest, updateFbCommentRequest } from "./action"
import { facebookPostSchema, fbCommentResource } from "./resource"

const sortSchema = z.array(z.object({ id: z.string(), desc: z.boolean() }))

export const listFbCommentsPublicRequest = publicListRequest.extend({
  sort: sortSchema.optional().describe("Sort order."),
  name: z
    .string()
    .nullish()
    .describe(
      "Case-insensitive substring match against the automation's name.",
    ),
  folderId: zodBigintAsString().nullish().describe("Restrict to this folder."),
  isActive: z
    .boolean()
    .nullish()
    .describe("Restrict to enabled or disabled automations."),
})

export const fbCommentPublicResource = fbCommentResource.omit({
  workspaceId: true,
})

export const listFbCommentsPublicResponse = publicListResponse(
  fbCommentPublicResource,
)

export const createFbCommentPublicRequest = createFbCommentRequest

export const updateFbCommentPublicRequest = updateFbCommentRequest.and(
  z.object({
    id: zodBigintAsString().describe(
      "FB comment automation id. Get it from `fbComments.list`.",
    ),
  }),
)

export const getFbCommentPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "FB comment automation id. Get it from `fbComments.list`.",
  ),
})

export const deleteFbCommentPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "FB comment automation id. Get it from `fbComments.list`.",
  ),
})

export const listFacebookPostsPublicResponse = z.object({
  published: z.array(facebookPostSchema),
  ads: z.array(facebookPostSchema),
  reels: z.array(facebookPostSchema),
  pages: z.array(z.object({ id: z.string(), name: z.string() })),
})
