import z from "zod"
import { chatbotTokenAPI } from "@/orpc"
import { createTag } from "../actions/create-tag-action"
import { deleteTags } from "../actions/delete-tag-action"
import { updateTag } from "../actions/update-tag-action"
import { listTags } from "../queries"
import { createTagRequest, createTagResponse } from "../schemas/action"
import { listTagsRequest, listTagsResponse } from "../schemas/query"
import { updateTagSchema } from "../schemas/update-tag-schema"

export const publicListTagsAPI = chatbotTokenAPI
  .route({
    method: "GET",
    path: "/public/chatbots/tags",
    summary: "List tags",
    tags: ["Tags"],
  })
  .input(listTagsRequest)
  .output(listTagsResponse)
  .handler(async ({ context, input }) => {
    return await listTags({ ...input, chatbotId: context.chatbot.id })
  })

export const publicCreateTagAPI = chatbotTokenAPI
  .route({
    method: "POST",
    path: "/public/chatbots/tags",
    summary: "Create tag",
    tags: ["Tags"],
  })
  .input(createTagRequest)
  .output(createTagResponse)
  .handler(async ({ context, input }) => {
    return await createTag({ ...input, chatbotId: context.chatbot.id })
  })

export const publicUpdateTagAPI = chatbotTokenAPI
  .route({
    method: "PUT",
    path: "/public/chatbots/tags/{id}",
    summary: "Update tag",
    tags: ["Tags"],
  })
  .input(updateTagSchema.and(z.object({ id: z.string() })))
  .handler(async ({ context, input }) => {
    const { id, ...rest } = input
    return await updateTag({
      chatbotId: context.chatbot.id,
      id,
      parsedInput: rest,
    })
  })

export const publicDeleteTagsAPI = chatbotTokenAPI
  .route({
    method: "DELETE",
    path: "/public/chatbots/tags",
    summary: "Delete tags",
    tags: ["Tags"],
  })
  .input(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ context, input }) => {
    const { ids } = input
    return await deleteTags({
      chatbotId: context.chatbot.id,
      ids,
    })
  })

const publicTagsAPI = {
  publicListTagsAPI,
  publicCreateTagAPI,
  publicUpdateTagAPI,
  publicDeleteTagsAPI,
}

export default publicTagsAPI
