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
})

export const emailTopicPublicResource = emailTopicResource.omit({
  workspaceId: true,
})

export const listEmailTopicsPublicResponse = publicListResponse(
  emailTopicPublicResource,
)

export const createEmailTopicPublicRequest = createEmailTopicRequest

export const updateEmailTopicPublicRequest = updateEmailTopicRequest.and(
  z.object({ id: zodBigintAsString() }),
)
