import z from "zod"
import { NotfoundException } from "@/lib/errors/exception"
import { maxPerPage } from "@/lib/shared-request"
import { chatbotTokenAPI } from "@/orpc"
import { createTag } from "../actions/create-tag-action"
import { deleteTag } from "../actions/delete-tag-action"
import { updateTag } from "../actions/update-tag-action"
import { findTag, listTags } from "../queries"
import { createTagRequest } from "../schemas/action"
import { publicLstTagsResponse } from "../schemas/query"
import { publicTagResource, tagResource } from "../schemas/resource"

export const publicListTagsAPI = chatbotTokenAPI
  .route({
    method: "GET",
    path: "/public/chatbots/tags",
    summary: "Get all tags",
    tags: ["Chatbots"],
  })
  .input(z.object({}))
  .output(publicLstTagsResponse)
  .handler(async ({ context, input }) => {
    return await listTags({
      ...input,
      chatbotId: context.chatbot.id,
      sort: [{ id: "createdAt", desc: true }],
      perPage: maxPerPage,
    })
  })

export const publicCreateTagAPI = chatbotTokenAPI
  .route({
    method: "POST",
    path: "/public/chatbots/tags",
    summary: "Create a new tag",
    tags: ["Chatbots"],
    successStatus: 201,
  })
  .input(createTagRequest.pick({ name: true }))
  .output(publicTagResource)
  .handler(async ({ context, input }) => {
    const { data } = await createTag({
      ...input,
      chatbotId: context.chatbot.id,
    })

    return data
  })

export const publicFindTagAPI = chatbotTokenAPI
  .route({
    method: "GET",
    path: "/public/chatbots/tags/{id}",
    summary: "Get tag by id",
    tags: ["Chatbots"],
  })
  .input(z.object({ id: z.string() }))
  .output(tagResource.pick({ id: true, name: true }))
  .handler(async ({ context, input }) => {
    const tag = await findTag({
      ...input,
      chatbotId: context.chatbot.id,
    })

    if (!tag) {
      throw new NotfoundException("Tag not found")
    }

    return tag
  })

export const publicFindTagByNameAPI = chatbotTokenAPI
  .route({
    method: "GET",
    path: "/public/chatbots/tags/name/{name}",
    summary: "Get tag by name",
    tags: ["Chatbots"],
  })
  .input(z.object({ name: z.string() }))
  .output(publicTagResource)
  .handler(async ({ context, input }) => {
    const tag = await findTag({
      ...input,
      chatbotId: context.chatbot.id,
    })
    if (!tag) {
      throw new NotfoundException("Tag not found")
    }

    return tag
  })

export const publicUpdateTagAPI = chatbotTokenAPI
  .route({
    method: "PUT",
    path: "/public/chatbots/tags/{id}",
    summary: "Update tag",
    tags: ["Chatbots"],
  })
  .input(
    createTagRequest.pick({ name: true }).and(z.object({ id: z.string() })),
  )
  .output(publicTagResource)
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
    path: "/public/chatbots/tags/{id}",
    summary: "Delete tag",
    tags: ["Chatbots"],
    successStatus: 204,
  })
  .input(z.object({ id: z.string() }))
  .handler(async ({ context, input }) => {
    const { id } = input

    return await deleteTag({
      chatbotId: context.chatbot.id,
      id,
    })
  })

const publicTagsAPI = {
  publicListTagsAPI,
  publicCreateTagAPI,
  publicUpdateTagAPI,
  publicDeleteTagsAPI,
  publicFindTagAPI,
  publicFindTagByNameAPI,
}

export default publicTagsAPI
