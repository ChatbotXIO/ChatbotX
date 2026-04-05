import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { createCustomField } from "../actions/create-custom-field.action"
import { deleteCustomFields } from "../actions/delete-custom-field.action"
import { updateCustomField } from "../actions/update-custom-field.action"
import { listCustomFields } from "../queries"
import {
  createCustomFieldRequest,
  createCustomFieldResponse,
  updateCustomFieldRequest,
} from "../schemas/action"
import {
  listCustomFieldsRequest,
  listCustomFieldsResponse,
} from "../schemas/query"

export const privateCustomFieldsAPI = {
  privateListCustomFieldsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/custom-fields",
      summary: "List custom fields",
      tags: ["Custom Fields"],
    })
    .input(listCustomFieldsRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listCustomFieldsResponse)
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input
      return await listCustomFields({ ...rest, workspaceId })
    }),

  privateCreateCustomFieldAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/custom-fields",
      summary: "Create custom field",
      tags: ["Custom Fields"],
    })
    .input(createCustomFieldRequest.and(withWorkspaceIdSchema))
    .output(createCustomFieldResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input
      const customField = await createCustomField(workspaceId, rest)
      return { id: customField.id }
    }),

  privateUpdateCustomFieldAPI: authorizedAPI
    .route({
      method: "PUT",
      path: "/workspaces/{workspaceId}/custom-fields/{id}",
      summary: "Update custom field",
      tags: ["Custom Fields"],
    })
    .input(
      updateCustomFieldRequest
        .and(withWorkspaceIdSchema)
        .and(z.object({ id: zodBigintAsString() })),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { id, workspaceId, ...rest } = input
      return await updateCustomField(
        {
          workspaceId,
          id,
        },
        rest,
      )
    }),

  privateDeleteCustomFieldsAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/custom-fields/{customFieldId}",
      summary: "Delete custom field",
      tags: ["Custom Fields"],
    })
    .input(
      z.object({
        workspaceId: zodBigintAsString(),
        customFieldId: zodBigintAsString(),
      }),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, customFieldId } = input
      return await deleteCustomFields({
        workspaceId,
        ids: [customFieldId],
      })
    }),
}

export default privateCustomFieldsAPI
