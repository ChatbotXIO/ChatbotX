import { igStoryAutomationTypes } from "@chatbotx.io/database/partials"
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

export const getIgStoryPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const deleteIgStoryPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const listInstagramStoriesPublicRequest = z.object({
  variant: igStoryAutomationTypes,
})

export const listInstagramStoriesPublicResponse = z.object({
  stories: z.array(
    z.object({
      id: z.string(),
      message: z.string().optional(),
      full_picture: z.string().optional(),
      created_time: z.string(),
      permalink_url: z.string().optional(),
      accountId: z.string(),
    }),
  ),
  pages: z.array(z.object({ id: z.string(), name: z.string() })),
})
