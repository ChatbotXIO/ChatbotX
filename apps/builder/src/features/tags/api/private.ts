import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { createTag } from "../actions/create-tag-action"
import { deleteTags } from "../actions/delete-tag-action"
import { updateTag } from "../actions/update-tag-action"
import { listTags } from "../queries"
import { createTagRequest, updateTagSchema } from "../schema/action"
import { listTagsRequest, listTagsResponse } from "../schema/query"

export const privateListChatbotTagsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/tags",
    summary: "List tags",
    tags: ["Tags"],
  })
  .input(listTagsRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(listTagsResponse)
  .handler(async ({ input }) => {
    return await listTags(input)
  })

export const privateCreateChatbotTagAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/tags",
    summary: "Create a tag",
    tags: ["Tags"],
  })
  .input(createTagRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(z.object({ id: zodBigintAsString() }))
  .handler(async ({ input }) => {
    const { data } = await createTag(input)
    return { id: data.id }
  })

export const privateUpdateTagAPI = authorizedAPI
  .route({
    method: "PUT",
    path: "/workspaces/{workspaceId}/tags/{id}",
    summary: "Update tag",
    tags: ["Tags"],
  })
  .input(
    updateTagSchema.and(withWorkspaceIdSchema).and(
      z.object({
        id: zodBigintAsString(),
      }),
    ),
  )
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const { id, workspaceId, ...rest } = input
    return await updateTag({
      workspaceId,
      id,
      parsedInput: rest,
    })
  })

export const privateDeleteTagsAPI = authorizedAPI
  .route({
    method: "DELETE",
    path: "/workspaces/{workspaceId}/tags/{id}",
    summary: "Delete tag",
    tags: ["Tags"],
  })
  .input(
    withWorkspaceIdSchema.and(
      z.object({
        id: zodBigintAsString(),
      }),
    ),
  )
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .handler(async ({ input }) => {
    const { workspaceId, id } = input
    return await deleteTags({
      workspaceId,
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
