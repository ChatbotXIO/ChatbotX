import { tagService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { createTag } from "../actions/create-tag-action"
import { deleteTag } from "../actions/delete-tag-action"
import { updateTag } from "../actions/update-tag-action"
import { listTags } from "../queries"
import { createTagRequest } from "../schema/action"
import { publicListTagsResponse } from "../schema/query"
import { publicTagResource, tagResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const tagsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/tags",
      summary: "Get all tags",
      tags: ["Tags"],
    })
    .input(z.object({}))
    .output(publicListTagsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await listTags({
          ...input,
          workspaceId: context.workspace.id,
          sort: [{ id: "createdAt", desc: true }],
          perPage: maxPerPage,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/tags",
      summary: "Create a new tag",
      successStatus: 201,
      tags: ["Tags"],
    })
    .input(createTagRequest.pick({ name: true }))
    .output(publicTagResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { data } = await createTag({
        ...input,
        workspaceId: context.workspace.id,
      })

      return data
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/tags/{idOrName}",
      summary: "Get tag by id or name",
      tags: ["Tags"],
    })
    .input(z.object({ idOrName: z.string() }))
    .output(tagResource.pick({ id: true, name: true }))
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await tagService.findByKeyOrFail({
          key: input.idOrName,
          workspaceId: context.workspace.id,
        }),
    ),

  update: workspaceTokenAuthAPI
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
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      return await updateTag({
        workspaceId: context.workspace.id,
        id,
        parsedInput: rest,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/tags/{id}",
      summary: "Delete tag",
      successStatus: 204,
      tags: ["Tags"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const { id } = input

      return await deleteTag({
        workspaceId: context.workspace.id,
        id,
      })
    }),
}
