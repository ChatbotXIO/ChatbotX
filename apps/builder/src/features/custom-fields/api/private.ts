import { customFieldService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listCustomFields } from "../queries"
import {
  createCustomFieldRequest,
  createCustomFieldResponse,
  updateCustomFieldRequest,
} from "../schema/action"
import {
  listCustomFieldsRequest,
  listCustomFieldsResponse,
} from "../schema/query"

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
      const { workspaceId, ...data } = input
      const customField = await customFieldService.create({
        workspaceId,
        data,
      })
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
      const { id, workspaceId, ...data } = input
      return await customFieldService.update({ workspaceId, id }, data)
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
      return await customFieldService.delete({
        workspaceId,
        ids: [customFieldId],
      })
    }),
}
