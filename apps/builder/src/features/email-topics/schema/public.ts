import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { createEmailTopicRequest, updateEmailTopicRequest } from "./action"
import { emailTopicResource } from "./resource"

export const listEmailTopicsPublicRequest = publicListRequest.extend({
  name: createEmailTopicRequest.shape.name.nullish(),
  folderId: zodBigintAsString().nullish(),
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
