import { igCommentAutomationTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createIgCommentRequest, updateIgCommentRequest } from "./action"
import { igCommentResource } from "./resource"

const sortSchema = z.array(z.object({ id: z.string(), desc: z.boolean() }))

export const listIgCommentsPublicRequest = publicListRequest.extend({
  sort: sortSchema.optional(),
  name: z.string().nullish(),
  folderId: zodBigintAsString().nullish(),
  isActive: z.boolean().nullish(),
})

export const igCommentPublicResource = igCommentResource.omit({
  workspaceId: true,
})

export const listIgCommentsPublicResponse = publicListResponse(
  igCommentPublicResource,
)

export const createIgCommentPublicRequest = createIgCommentRequest

export const updateIgCommentPublicRequest = updateIgCommentRequest.and(
  z.object({ id: zodBigintAsString() }),
)

export const getIgCommentPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const deleteIgCommentPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const listInstagramMediaPublicRequest = z.object({
  variant: igCommentAutomationTypes,
})

export const listInstagramMediaPublicResponse = z.object({
  posts: z.array(
    z.object({
      id: z.string(),
      message: z.string().optional(),
      full_picture: z.string().optional(),
      created_time: z.string(),
      permalink_url: z.string().optional(),
      media_product_type: z.string().optional(),
      accountId: z.string(),
    }),
  ),
  pages: z.array(z.object({ id: z.string(), name: z.string() })),
})
