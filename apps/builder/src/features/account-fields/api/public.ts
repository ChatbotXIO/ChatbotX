import z from "zod"
import { NotfoundException } from "@/lib/errors/exception"
import { chatbotTokenAPI } from "@/orpc"
import { updateAccountField } from "../actions/update-account-field.action"
import { findAccountField } from "../queries/index"
import { publicAccountFieldResource } from "../schemas/resource"

const publicBotFieldsAPI = {
  publicFindBotFieldAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/bot-fields/{id}",
      summary: "Get bot field by id",
      tags: ["Chatbots"],
    })
    .input(z.object({ id: z.string() }))
    .output(publicAccountFieldResource)
    .handler(async ({ context, input }) => {
      const botField = await findAccountField({
        id: input.id,
        chatbotId: context.chatbot.id,
      })
      if (!botField) {
        throw new NotfoundException("Bot field not found")
      }
      return botField
    }),

  publicUpdateBotFieldAPI: chatbotTokenAPI
    .route({
      method: "PUT",
      path: "/public/chatbots/bot-fields/{id}",
      summary: "Update bot field",
      tags: ["Chatbots"],
    })
    .input(z.object({ id: z.string(), value: z.string() }))
    .output(publicAccountFieldResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      return await updateAccountField({
        chatbotId: context.chatbot.id,
        id,
        parsedInput: rest,
      })
    }),

  publicDeleteBotFieldsAPI: chatbotTokenAPI
    .route({
      method: "DELETE",
      path: "/public/chatbots/bot-fields/{id}",
      summary: "Unset the value of the bot field",
      tags: ["Chatbots"],
    })
    .input(z.object({ id: z.string() }))
    .output(publicAccountFieldResource)
    .handler(async ({ context, input }) => {
      return await updateAccountField({
        chatbotId: context.chatbot.id,
        id: input.id,
        parsedInput: {
          value: null,
        },
      })
    }),
}

export default publicBotFieldsAPI
