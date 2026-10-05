import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import {
  createThreadsCommentRequest,
  updateThreadsCommentRequest,
} from "./action"
import { threadsCommentResource } from "./resource"

const sortSchema = z.array(z.object({ id: z.string(), desc: z.boolean() }))

const threadsCommentIdSchema = zodBigintAsString().describe(
  "Threads comment automation id. Get it from `threadsComments.list`.",
)

export const listThreadsCommentsPublicRequest = publicListRequest.extend({
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

export const threadsCommentPublicResource = threadsCommentResource.omit({
  workspaceId: true,
})

export const listThreadsCommentsPublicResponse = publicListResponse(
  threadsCommentPublicResource,
)

export const createThreadsCommentPublicRequest = createThreadsCommentRequest

export const updateThreadsCommentPublicRequest =
  updateThreadsCommentRequest.and(z.object({ id: threadsCommentIdSchema }))

export const getThreadsCommentPublicRequest = z.object({
  id: threadsCommentIdSchema,
})

export const deleteThreadsCommentPublicRequest = z.object({
  id: threadsCommentIdSchema,
})
