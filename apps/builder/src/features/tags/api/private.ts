import { tagService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listTags } from "../queries"
import { createTagRequest, updateTagSchema } from "../schema/action"
import { listTagsRequest, listTagsResponse } from "../schema/query"

const privateListWorkspaceTagsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/tags",
    summary: "List tags",
    tags: ["Tags"],
  })
  .input(listTagsRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(listTagsResponse)
  .handler(async ({ input }) => await listTags(input))

const privateCreateWorkspaceTagAPI = authorizedAPI
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
    const { workspaceId, ...data } = input
    const tag = await tagService.create({ workspaceId, data })
    return { id: tag.id }
  })

const privateUpdateTagAPI = authorizedAPI
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
    const { id, workspaceId, ...data } = input
    return await tagService.update({ workspaceId, id, data })
  })

const privateDeleteTagsAPI = authorizedAPI
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
    return await tagService.deleteMany({ workspaceId, ids: [id] })
  })

export const privateTagsAPI = {
  privateListWorkspaceTagsAPI,
  privateCreateWorkspaceTagAPI,
  privateUpdateTagAPI,
  privateDeleteTagsAPI,
}
