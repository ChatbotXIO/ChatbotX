import z from "zod"
import { NotfoundException } from "@/lib/errors/exception"
import { chatbotTokenAPI } from "@/orpc"
import { createCustomField } from "../actions/create-custom-field.action"
import { findCustomField, listCustomFields } from "../queries"
import { createCustomFieldRequest } from "../schemas/action"
import { publicCustomFieldResource } from "../schemas/resource"

const publicCustomFieldsAPI = {
  publicListCustomFieldsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/custom-fields",
      summary: "Get all custom fields",
    })
    .input(z.object({}))
    .output(z.object({ data: z.array(publicCustomFieldResource) }))
    .handler(async ({ context, input }) => {
      return await listCustomFields({ ...input, chatbotId: context.chatbot.id })
    }),

  publicCreateCustomFieldAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/chatbots/custom-fields",
      summary: "Create a custom field",
    })
    .input(createCustomFieldRequest.pick({ name: true, customFieldType: true }))
    .output(publicCustomFieldResource)
    .handler(async ({ context, input }) => {
      return await createCustomField(context.chatbot.id, input)
    }),

  publicFindCustomFieldAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/custom-fields/{id}",
      summary: "Get custom field by id",
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

  publicFindCustomFieldByNameAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/custom-fields/name/{name}",
      summary: "Get custom field by name",
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

  // publicUpdateCustomFieldAPI: chatbotTokenAPI
  //   .route({
  //     method: "PUT",
  //     path: "/public/chatbots/custom-fields/{id}",
  //     summary: "Update custom field",
  //     tags: ["Custom Fields"],
  //   })
  //   .input(updateCustomFieldRequest.and(z.object({ id: z.string() })))
  //   .handler(async ({ context, input }) => {
  //     const { id, ...rest } = input
  //     return await updateCustomField({
  //       chatbotId: context.chatbot.id,
  //       id,
  //       parsedInput: rest,
  //     })
  //   }),

  // publicDeleteCustomFieldsAPI: chatbotTokenAPI
  //   .route({
  //     method: "DELETE",
  //     path: "/public/chatbots/custom-fields/{customFieldId}",
  //     summary: "Delete custom field",
  //     tags: ["Custom Fields"],
  //   })
  //   .input(z.object({ customFieldId: z.string() }))
  //   .handler(async ({ context, input }) => {
  //     const { customFieldId } = input
  //     return await deleteCustomFields({
  //       chatbotId: context.chatbot.id,
  //       ids: [customFieldId],
  //     })
  //   }),
}

export default publicCustomFieldsAPI
