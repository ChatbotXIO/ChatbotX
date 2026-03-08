import z from "zod"
import { withChatbotIdSchema } from "@/features/chatbots/schemas/resource"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { createTag } from "../actions/create-tag-action"
import { deleteTags } from "../actions/delete-tag-action"
import { updateTag } from "../actions/update-tag-action"
import { listTags } from "../queries"
import { createTagRequest } from "../schemas/action"
import { listTagsRequest, listTagsResponse } from "../schemas/query"
import { updateTagSchema } from "../schemas/update-tag-schema"

export const privateListChatbotTagsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/chatbots/{chatbotId}/tags",
    summary: "List tags",
    tags: ["Tags"],
  })
  .input(listTagsRequest.and(withChatbotIdSchema))
  .use(chatbotAuthMiddleware, (input) => input.chatbotId)
  .output(listTagsResponse)
  .handler(async ({ input }) => {
    return await listTags(input)
  })

export const privateCreateChatbotTagAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/chatbots/{chatbotId}/tags",
    summary: "Create a tag",
    tags: ["Tags"],
  })
  .input(createTagRequest.and(withChatbotIdSchema))
  .use(chatbotAuthMiddleware, (input) => input.chatbotId)
  .output(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    const { data } = await createTag(input)
    return { id: data.id }
  })

export const privateUpdateTagAPI = authorizedAPI
  .route({
    method: "PUT",
    path: "/chatbots/{chatbotId}/tags/{id}",
    summary: "Update tag",
    tags: ["Tags"],
  })
  .input(
    updateTagSchema.and(withChatbotIdSchema).and(
      z.object({
        id: z.cuid2(),
      }),
    ),
  )
  .use(chatbotAuthMiddleware, (input) => input.chatbotId)
  .handler(async ({ input }) => {
    const { id, chatbotId, ...rest } = input
    return await updateTag({
      chatbotId,
      id,
      parsedInput: rest,
    })
  })

export const privateDeleteTagsAPI = authorizedAPI
  .route({
    method: "DELETE",
    path: "/chatbots/{chatbotId}/tags/{id}",
    summary: "Delete tag",
    tags: ["Tags"],
  })
  .input(
    withChatbotIdSchema.and(
      z.object({
        id: z.string(),
      }),
    ),
  )
  .use(chatbotAuthMiddleware, (input) => input.chatbotId)
  .handler(async ({ input }) => {
    const { chatbotId, id } = input
    return await deleteTags({
      chatbotId,
      ids: [id],
    })
  })

const privateTagsAPI = {
  privateListChatbotTagsAPI,
  privateCreateChatbotTagAPI,
  privateUpdateTagAPI,
  privateDeleteTagsAPI,
}

export default privateTagsAPI
