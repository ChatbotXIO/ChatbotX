import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
} from "@/lib/orpc/orpc-error-helper"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createCustomField } from "../actions/create-custom-field.action"
import { deleteCustomFields } from "../actions/delete-custom-field.action"
import { updateCustomField } from "../actions/update-custom-field.action"
import { findCustomFieldByKey, listCustomFields } from "../queries"
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
      const result = await listCustomFields({
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
        await createCustomField(context.workspace.id, input),
    ),

  searchCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields/search",
      summary: "Search custom field by id or name",
      tags: ["Custom Fields"],
    })
    .input(z.object({ key: z.string() }))
    .output(publicCustomFieldResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const customField = await findCustomFieldByKey({
        key: input.key,
        workspaceId: context.workspace.id,
      })
      if (!customField) {
        throw notFoundException("Custom field not found")
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
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      await updateCustomField({ workspaceId: context.workspace.id, id }, rest)
      const updated = await findCustomFieldByKey({
        key: id,
        workspaceId: context.workspace.id,
      })
      if (!updated) {
        throw notFoundException("Custom field not found")
      }
      return updated
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
        await deleteCustomFields({
          workspaceId: context.workspace.id,
          ids: [input.id],
        }),
    ),
}

export default customFieldsWorkspaceTokenAPI
