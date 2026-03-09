import z from "zod"
import { chatbotTokenAPI } from "@/orpc"
import { createCustomField } from "../actions/create-custom-field.action"
import { deleteCustomFields } from "../actions/delete-custom-field.action"
import { updateCustomField } from "../actions/update-custom-field.action"
import { listCustomFields } from "../queries"
import {
  createCustomFieldRequest,
  updateCustomFieldRequest,
} from "../schemas/action"
import {
  listCustomFieldsRequest,
  listCustomFieldsResponse,
} from "../schemas/query"

const publicCustomFieldsAPI = {
  publicListCustomFieldsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/custom-fields",
      summary: "List custom fields",
      tags: ["Custom Fields"],
    })
    .input(listCustomFieldsRequest)
    .output(listCustomFieldsResponse)
    .handler(async ({ context, input }) => {
      return await listCustomFields({ ...input, chatbotId: context.chatbot.id })
    }),
  publicCreateCustomFieldAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/chatbots/custom-fields",
      summary: "Create custom field",
      tags: ["Custom Fields"],
    })
    .input(createCustomFieldRequest)
    .handler(async ({ context, input }) => {
      return await createCustomField(context.chatbot.id, input)
    }),
  publicUpdateCustomFieldAPI: chatbotTokenAPI
    .route({
      method: "PUT",
      path: "/public/chatbots/custom-fields/{id}",
      summary: "Update custom field",
      tags: ["Custom Fields"],
    })
    .input(updateCustomFieldRequest.and(z.object({ id: z.string() })))
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      return await updateCustomField({
        chatbotId: context.chatbot.id,
        id,
        parsedInput: rest,
      })
    }),
  publicDeleteCustomFieldsAPI: chatbotTokenAPI
    .route({
      method: "DELETE",
      path: "/public/chatbots/custom-fields",
      summary: "Delete custom fields",
      tags: ["Custom Fields"],
    })
    .input(z.object({ ids: z.array(z.string()) }))
    .handler(async ({ context, input }) => {
      const { ids } = input
      return await deleteCustomFields({
        chatbotId: context.chatbot.id,
        ids,
      })
    }),
}

export default publicCustomFieldsAPI
