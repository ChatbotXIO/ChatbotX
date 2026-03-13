import z from "zod"
import { NotfoundException } from "@/lib/errors/exception"
import { chatbotTokenAPI } from "@/orpc"
import { updateBotField } from "../actions/update-bot-field.action"
import { findBotField } from "../queries/index"
import { publicBotFieldResource } from "../schemas/resource"

const botFieldChatbotTokenAPIs = {
  findBotFieldChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/v1/bot-fields/{id}",
      summary: "Get bot field by id",
      tags: ["Bot Fields"],
    })
    .input(z.object({ id: z.string() }))
    .output(publicBotFieldResource)
    .handler(async ({ context, input }) => {
      const botField = await findBotField({
        id: input.id,
        chatbotId: context.chatbot.id,
      })
      if (!botField) {
        throw new NotfoundException("Bot field not found")
      }
      return botField
    }),

  updateBotFieldChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "PUT",
      path: "/v1/bot-fields/{id}",
      summary: "Update bot field",
      tags: ["Bot Fields"],
    })
    .input(z.object({ id: z.string(), value: z.string() }))
    .output(publicBotFieldResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      return await updateBotField({
        chatbotId: context.chatbot.id,
        id,
        parsedInput: rest,
      })
    }),

  deleteBotFieldsChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "DELETE",
      path: "/v1/bot-fields/{id}",
      summary: "Unset the value of the bot field",
      tags: ["Bot Fields"],
    })
    .input(z.object({ id: z.string() }))
    .output(publicBotFieldResource)
    .handler(async ({ context, input }) => {
      return await updateBotField({
        chatbotId: context.chatbot.id,
        id: input.id,
        parsedInput: {
          value: null,
        },
      })
    }),
}

export default botFieldChatbotTokenAPIs
