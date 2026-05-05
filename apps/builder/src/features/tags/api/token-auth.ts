import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  posibleErrorsOnCreatingResource,
  posibleErrorsOnDeletingResource,
  posibleErrorsOnFindingResource,
} from "@/lib/orpc/orpc-error-helper"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createTag } from "../actions/create-tag-action"
import { deleteTag } from "../actions/delete-tag-action"
import { updateTag } from "../actions/update-tag-action"
import { findTag, listTags } from "../queries"
import { createTagRequest } from "../schema/action"
import { publicListTagsResponse } from "../schema/query"
import { publicTagResource, tagResource } from "../schema/resource"

const listTagsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/tags",
    summary: "Get all tags",
    tags: ["Tags"],
  })
  .input(z.object({}))
  .output(publicListTagsResponse)
  .errors(posibleErrorsOnFindingResource)
  .handler(
    async ({ context, input }) =>
      await listTags({
        ...input,
        workspaceId: context.workspace.id,
        sort: [{ id: "createdAt", desc: true }],
        perPage: maxPerPage,
      }),
  )

const createTagWorkspaceTokenAPI = workspaceTokenAuthAPI
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
      workspaceId: context.workspace.id,
    })

    return data
  })

const findTagWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/tags/{id}",
    summary: "Get tag by id",
    tags: ["Tags"],
  })
  .input(z.object({ id: zodBigintAsString() }))
  .output(tagResource.pick({ id: true, name: true }))
  .errors(posibleErrorsOnFindingResource)
  .handler(async ({ context, input }) => {
    const tag = await findTag({
      ...input,
      workspaceId: context.workspace.id,
    })

    if (!tag) {
      throw notFoundException("Tag not found")
    }

    return tag
  })

const findTagByNameWorkspaceTokenAPI = workspaceTokenAuthAPI
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
      workspaceId: context.workspace.id,
    })
    if (!tag) {
      throw notFoundException("Tag not found")
    }

    return tag
  })

const updateTagWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "PUT",
    path: "/v1/tags/{id}",
    summary: "Update tag",
    tags: ["Tags"],
  })
  .input(
    createTagRequest
      .pick({ name: true })
      .and(z.object({ id: zodBigintAsString() })),
  )
  .output(publicTagResource)
  .errors(posibleErrorsOnCreatingResource)
  .handler(async ({ context, input }) => {
    const { id, ...rest } = input
    return await updateTag({
      workspaceId: context.workspace.id,
      id,
      parsedInput: rest,
    })
  })

const deleteTagsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/tags/{id}",
    summary: "Delete tag",
    successStatus: 204,
    tags: ["Tags"],
  })
  .input(z.object({ id: zodBigintAsString() }))
  .errors(posibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    const { id } = input

    return await deleteTag({
      workspaceId: context.workspace.id,
      id,
    })
  })

export const tagWorkspaceTokenAPIs = {
  listTagsWorkspaceTokenAPI,
  createTagWorkspaceTokenAPI,
  findTagWorkspaceTokenAPI,
  findTagByNameWorkspaceTokenAPI,
  updateTagWorkspaceTokenAPI,
  deleteTagsWorkspaceTokenAPI,
}
