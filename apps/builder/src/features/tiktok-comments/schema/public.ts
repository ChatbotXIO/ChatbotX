import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import {
  createTiktokCommentRequest,
  updateTiktokCommentRequest,
} from "./action"
import { tiktokCommentResource } from "./resource"

const sortSchema = z.array(z.object({ id: z.string(), desc: z.boolean() }))

const tiktokCommentIdSchema = zodBigintAsString().describe(
  "TikTok comment automation id. Get it from `tiktokComments.list`.",
)

export const listTiktokCommentsPublicRequest = publicListRequest.extend({
  sort: sortSchema.optional().describe("Sort order."),
  name: z
    .string()
    .nullish()
    .describe(
      "Case-insensitive substring match against the automation's name.",
    ),
  isActive: z
    .boolean()
    .nullish()
    .describe("Restrict to enabled or disabled automations."),
})

export const tiktokCommentPublicResource = tiktokCommentResource.omit({
  workspaceId: true,
})

export const listTiktokCommentsPublicResponse = publicListResponse(
  tiktokCommentPublicResource,
)

export const createTiktokCommentPublicRequest = createTiktokCommentRequest

export const updateTiktokCommentPublicRequest = updateTiktokCommentRequest.and(
  z.object({ id: tiktokCommentIdSchema }),
)

export const getTiktokCommentPublicRequest = z.object({
  id: tiktokCommentIdSchema,
})

export const deleteTiktokCommentPublicRequest = z.object({
  id: tiktokCommentIdSchema,
})
