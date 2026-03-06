import { chatbotTokenAPI } from "@/orpc"
import { createTag } from "../actions/create-tag-action"
import { listTags } from "../queries"
import { createTagRequest, createTagResponse } from "../schemas/action"
import { listTagsRequest, listTagsResponse } from "../schemas/query"

const publicListTagsAPI = chatbotTokenAPI
  .route({
    method: "GET",
    path: "/public/chatbots/tags",
    summary: "List tags",
    tags: ["Tags", "Public APIs"],
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

const publicTagsAPI = {
  publicListTagsAPI,
  // createTagAPI,
}

export default publicTagsAPI
