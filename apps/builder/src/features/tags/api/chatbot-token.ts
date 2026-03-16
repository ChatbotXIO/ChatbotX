import z from "zod"
import { notFoundException } from "@/lib/errors/exception"
import {
  posibleErrorsOnCreatingResource,
  posibleErrorsOnDeletingResource,
  posibleErrorsOnFindingResource,
} from "@/lib/orpc/orpc-error-helper"
import { maxPerPage } from "@/lib/shared-request"
import { chatbotTokenAPI } from "@/orpc"
import { createTag } from "../actions/create-tag-action"
import { deleteTag } from "../actions/delete-tag-action"
import { updateTag } from "../actions/update-tag-action"
import { findTag, listTags } from "../queries"
import { createTagRequest } from "../schemas/action"
import { publicLstTagsResponse } from "../schemas/query"
import { publicTagResource, tagResource } from "../schemas/resource"

export const listTagsChatbotTokenAPI = chatbotTokenAPI
  .route({
    method: "GET",
    path: "/v1/tags",
    summary: "Get all tags",
    tags: ["Tags"],
  })
  .input(z.object({}))
  .output(publicLstTagsResponse)
  .errors(posibleErrorsOnFindingResource)
  .handler(async ({ context, input }) => {
    return await listTags({
      ...input,
      chatbotId: context.chatbot.id,
      sort: [{ id: "createdAt", desc: true }],
      perPage: maxPerPage,
    })
  })

export const createTagChatbotTokenAPI = chatbotTokenAPI
  .route({
    method: "POST",
    path: "/v1/tags",
    summary: "Create a new tag",
    successStatus: 201,
    tags: ["Tags"],
  })
  .input(createTagRequest.pick({ name: true }))
  .output(publicTagResource)
  .errors(posibleErrorsOnCreatingResource)
  .handler(async ({ context, input }) => {
    const { data } = await createTag({
      ...input,
      chatbotId: context.chatbot.id,
    })

    return data
  })

export const findTagChatbotTokenAPI = chatbotTokenAPI
  .route({
    method: "GET",
    path: "/v1/tags/{id}",
    summary: "Get tag by id",
    tags: ["Tags"],
  })
  .input(z.object({ id: z.string() }))
  .output(tagResource.pick({ id: true, name: true }))
  .errors(posibleErrorsOnFindingResource)
  .handler(async ({ context, input }) => {
    const tag = await findTag({
      ...input,
      chatbotId: context.chatbot.id,
    })

    if (!tag) {
      throw notFoundException("Tag not found")
    }

    return tag
  })

export const findTagByNameChatbotTokenAPI = chatbotTokenAPI
  .route({
    method: "GET",
    path: "/v1/tags/name/{name}",
    summary: "Get tag by name",
    tags: ["Tags"],
  })
  .input(z.object({ name: z.string() }))
  .output(publicTagResource)
  .errors(posibleErrorsOnFindingResource)
  .handler(async ({ context, input }) => {
    const tag = await findTag({
      ...input,
      chatbotId: context.chatbot.id,
    })
    if (!tag) {
      throw notFoundException("Tag not found")
    }

    return tag
  })

export const updateTagChatbotTokenAPI = chatbotTokenAPI
  .route({
    method: "PUT",
    path: "/v1/tags/{id}",
    summary: "Update tag",
    tags: ["Tags"],
  })
  .input(
    createTagRequest.pick({ name: true }).and(z.object({ id: z.string() })),
  )
  .output(publicTagResource)
  .errors(posibleErrorsOnCreatingResource)
  .handler(async ({ context, input }) => {
    const { id, ...rest } = input
    return await updateTag({
      chatbotId: context.chatbot.id,
      id,
      parsedInput: rest,
    })
  })

export const deleteTagsChatbotTokenAPI = chatbotTokenAPI
  .route({
    method: "DELETE",
    path: "/v1/tags/{id}",
    summary: "Delete tag",
    successStatus: 204,
    tags: ["Tags"],
  })
  .input(z.object({ id: z.string() }))
  .errors(posibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    const { id } = input

    return await deleteTag({
      chatbotId: context.chatbot.id,
      id,
    })
  })

const tagChatbotTokenAPIs = {
  listTagsChatbotTokenAPI,
  createTagChatbotTokenAPI,
  findTagChatbotTokenAPI,
  findTagByNameChatbotTokenAPI,
  updateTagChatbotTokenAPI,
  deleteTagsChatbotTokenAPI,
}

export default tagChatbotTokenAPIs
