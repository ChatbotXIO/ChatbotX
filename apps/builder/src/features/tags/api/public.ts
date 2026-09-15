import { tagService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
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
      description:
        "Lists every tag in the workspace. Use `tags.create` to add one, or `contacts.addTags` to attach existing ones to a contact.",
      tags: ["Tags"],
    })
    .input(publicListRequest)
    .output(publicListTagsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await tagService.list({
          ...input,
          workspaceId: context.workspace.id,
          sort: [{ id: "createdAt", desc: true }],
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/tags",
      summary: "Create a new tag",
      description:
        "Adds a workspace tag and returns its id for later attachment to contacts. Use `tags.list` to check for an existing tag, or `contacts.addTags` to attach it.",
      successStatus: 201,
      tags: ["Tags"],
    })
    .input(createTagRequest.pick({ name: true }))
    .output(publicTagResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { data } = await tagService.create({
        data: input,
        workspaceId: context.workspace.id,
      })

      return data
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/tags/{idOrName}",
      summary: "Get tag by id or name",
      description:
        "Returns one tag's id and name. Use `tags.list` to find its id or name first.",
      tags: ["Tags"],
    })
    .input(
      z.object({
        idOrName: z
          .string()
          .describe("Tag id or name. Get it from `tags.list`."),
      }),
    )
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
      description:
        "Renames an existing tag. Use `tags.list` to find its id first.",
      tags: ["Tags"],
    })
    .input(
      createTagRequest.pick({ name: true }).and(
        z.object({
          id: zodBigintAsString().describe("Tag id. Get it from `tags.list`."),
        }),
      ),
    )
    .output(publicTagResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      return await tagService.update(
        { workspaceId: context.workspace.id, id },
        rest,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/tags/{id}",
      summary: "Delete tag",
      description:
        "Removes a tag from the workspace. Use `tags.list` to find its id first.",
      successStatus: 204,
      tags: ["Tags"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe("Tag id. Get it from `tags.list`."),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const { id } = input

      return await tagService.softDelete({
        workspaceId: context.workspace.id,
        ids: [id],
      })
    }),
}
