import { customFieldService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import {
  createCustomFieldRequest,
  updateCustomFieldRequest,
} from "../schema/action"
import { listPublicCustomFieldsResponse } from "../schema/query"
import { publicCustomFieldResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const customFieldsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields",
      summary: "Get all custom fields",
      tags: ["Custom Fields"],
    })
    .input(publicListRequest)
    .output(listPublicCustomFieldsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const result = await customFieldService.list({
        workspaceId: context.workspace.id,
        ...input,
      })
      return result
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/custom-fields",
      summary: "Create a custom field",
      successStatus: 201,
      tags: ["Custom Fields"],
    })
    .input(createCustomFieldRequest.pick({ name: true, type: true }))
    .output(publicCustomFieldResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await customFieldService.create({
          workspaceId: context.workspace.id,
          data: input,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields/{idOrName}",
      summary: "Get custom field by id or name",
      tags: ["Custom Fields"],
    })
    .input(z.object({ idOrName: z.string() }))
    .output(publicCustomFieldResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const customField = await customFieldService.findByKey({
        key: input.idOrName,
        workspaceId: context.workspace.id,
      })
      if (!customField) {
        throw new Error("Custom field not found")
      }
      return customField
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/custom-fields/{id}",
      summary: "Update custom field",
      tags: ["Custom Fields"],
    })
    .input(updateCustomFieldRequest.and(z.object({ id: zodBigintAsString() })))
    .output(publicCustomFieldResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      return await customFieldService.update(
        { workspaceId: context.workspace.id, id },
        rest,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/custom-fields/{id}",
      summary: "Delete custom field",
      successStatus: 204,
      tags: ["Custom Fields"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await customFieldService.delete({
          workspaceId: context.workspace.id,
          ids: [input.id],
        }),
    ),
}
