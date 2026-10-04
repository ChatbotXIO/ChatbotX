import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createEmailTopicRequest, updateEmailTopicRequest } from "./action"
import { emailTopicResource } from "./resource"

export const listEmailTopicsPublicRequest = publicListRequest.extend({
  name: createEmailTopicRequest.shape.name
    .nullish()
    .describe("Case-insensitive substring match on the topic name."),
  folderId: zodBigintAsString()
    .nullish()
    .describe('Folder id to filter by. Pass "0" for topics in no folder.'),
  sort: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .optional()
    .describe(
      "Sort order as [{ id, desc }] pairs, e.g. `name`, `createdAt`. Defaults to newest first.",
    ),
})

export const emailTopicPublicResource = emailTopicResource.omit({
  workspaceId: true,
})

export const listEmailTopicsPublicResponse = publicListResponse(
  emailTopicPublicResource,
)

export const createEmailTopicPublicRequest = createEmailTopicRequest

export const updateEmailTopicPublicRequest = updateEmailTopicRequest.extend({
  id: zodBigintAsString().describe(
    "Email topic id. Get it from `emailTopics.list`.",
  ),
})
