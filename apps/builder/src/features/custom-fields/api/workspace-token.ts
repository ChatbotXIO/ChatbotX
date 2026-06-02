import { customFieldService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthAPI } from "@/orpc"
import {
  createCustomFieldRequest,
  updateCustomFieldRequest,
} from "../schemas/action"
import { listPublicCustomFieldsResponse } from "../schemas/query"
import { publicCustomFieldResource } from "../schemas/resource"

const customFieldsWorkspaceTokenAPI = {
  listCustomFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields",
      summary: "Get all custom fields",
      tags: ["Custom Fields"],
    })
    .input(z.object({}))
    .output(listPublicCustomFieldsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context }) => {
      const result = await customFieldService.list({
        workspaceId: context.workspace.id,
        perPage: maxPerPage,
      })
      return { data: result.data }
    }),

  createCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
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

  findCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields/{keyword}",
      summary: "Get custom field by id or name",
      tags: ["Custom Fields"],
    })
    .input(z.object({ keyword: z.string() }))
    .output(publicCustomFieldResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const customField = await customFieldService.findByKey({
        key: input.keyword,
        workspaceId: context.workspace.id,
      })
      if (!customField) {
        throw new Error("Custom field not found")
      }
      return customField
    }),

  updateCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
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

  deleteCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
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

export default customFieldsWorkspaceTokenAPI
