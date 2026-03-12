import z from "zod"
import { withChatbotIdSchema } from "@/features/chatbots/schemas/resource"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
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
      path: "/chatbots/{chatbotId}/custom-fields",
      summary: "List custom fields",
      tags: ["Custom Fields"],
    })
    .input(listCustomFieldsRequest.and(withChatbotIdSchema))
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listCustomFieldsResponse)
    .handler(async ({ input }) => {
      const { chatbotId, ...rest } = input
      return await listCustomFields({ ...rest, chatbotId })
    }),

  privateCreateCustomFieldAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/chatbots/{chatbotId}/custom-fields",
      summary: "Create custom field",
      tags: ["Custom Fields"],
    })
    .input(createCustomFieldRequest.and(withChatbotIdSchema))
    .output(createCustomFieldResponse)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, ...rest } = input
      return await createCustomField(chatbotId, rest)
    }),

  privateUpdateCustomFieldAPI: authorizedAPI
    .route({
      method: "PUT",
      path: "/chatbots/{chatbotId}/custom-fields/{id}",
      summary: "Update custom field",
      tags: ["Custom Fields"],
    })
    .input(
      updateCustomFieldRequest
        .and(withChatbotIdSchema)
        .and(z.object({ id: z.string() })),
    )
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { id, chatbotId, ...rest } = input
      return await updateCustomField({
        chatbotId,
        id,
        parsedInput: rest,
      })
    }),

  privateDeleteCustomFieldsAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/chatbots/{chatbotId}/custom-fields/{customFieldId}",
      summary: "Delete custom field",
      tags: ["Custom Fields"],
    })
    .input(
      z.object({
        chatbotId: z.string(),
        customFieldId: z.string(),
      }),
    )
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, customFieldId } = input
      return await deleteCustomFields({
        chatbotId,
        ids: [customFieldId],
      })
    }),
}

export default privateCustomFieldsAPI
