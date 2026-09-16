import { igStoryAutomationTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createIgStoryRequest, updateIgStoryRequest } from "./action"
import { igStoryResource } from "./resource"

export const listIgStoriesPublicRequest = publicListRequest.extend({
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
export const igStoryPublicResource = igStoryResource.omit({
  workspaceId: true,
})
export const listIgStoriesPublicResponse = publicListResponse(
  igStoryPublicResource,
)
export const createIgStoryPublicRequest = createIgStoryRequest
export const updateIgStoryPublicRequest = updateIgStoryRequest.and(
  z.object({
    id: zodBigintAsString().describe(
      "Instagram story automation id. Get it from `igStories.list`.",
    ),
  }),
)

export const getIgStoryPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Instagram story automation id. Get it from `igStories.list`.",
  ),
})

export const deleteIgStoryPublicRequest = z.object({
  id: zodBigintAsString().describe(
    "Instagram story automation id. Get it from `igStories.list`.",
  ),
})

export const listInstagramStoriesPublicRequest = z.object({
  variant: igStoryAutomationTypes.describe(
    "Which Instagram connection type to list stories from, `instagram` (native login) or `instagramFacebook` (linked via a Facebook page).",
  ),
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
