import z from "zod"
import { NotfoundException } from "@/lib/errors/exception"
import { chatbotTokenAPI } from "@/orpc"
import { createCustomField } from "../actions/create-custom-field.action"
import { findCustomField, listCustomFields } from "../queries"
import { createCustomFieldRequest } from "../schemas/action"
import { publicCustomFieldResource } from "../schemas/resource"

const chatbotTokenCustomFieldsAPI = {
  listCustomFieldsChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields",
      summary: "Get all custom fields",
      tags: ["Custom Fields"],
    })
    .input(z.object({}))
    .output(z.object({ data: z.array(publicCustomFieldResource) }))
    .handler(async ({ context, input }) => {
      return await listCustomFields({ ...input, chatbotId: context.chatbot.id })
    }),

  createCustomFieldChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/v1/custom-fields",
      summary: "Create a custom field",
      tags: ["Custom Fields"],
    })
    .input(createCustomFieldRequest.pick({ name: true, type: true }))
    .output(publicCustomFieldResource)
    .handler(async ({ context, input }) => {
      return await createCustomField(context.chatbot.id, input)
    }),

  findCustomFieldChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields/{id}",
      summary: "Get custom field by id",
      tags: ["Custom Fields"],
    })
    .input(z.object({ id: z.string() }))
    .output(publicCustomFieldResource)
    .handler(async ({ context, input }) => {
      const customField = await findCustomField({
        id: input.id,
        chatbotId: context.chatbot.id,
      })
      if (!customField) {
        throw new NotfoundException("Custom field not found")
      }
      return customField
    }),

  findCustomFieldByNameChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields/name/{name}",
      summary: "Get custom field by name",
      tags: ["Custom Fields"],
    })
    .input(z.object({ name: z.string() }))
    .output(publicCustomFieldResource)
    .handler(async ({ context, input }) => {
      const customField = await findCustomField({
        chatbotId: context.chatbot.id,
        name: input.name,
      })
      if (!customField) {
        throw new NotfoundException("Custom field not found")
      }
      return customField
    }),
}

export default chatbotTokenCustomFieldsAPI
