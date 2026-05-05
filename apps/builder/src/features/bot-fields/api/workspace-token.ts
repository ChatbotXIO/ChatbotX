import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceTokenAuthAPI } from "@/orpc"
import { updateBotField } from "../actions/update-bot-field.action"
import { findBotField } from "../queries/index"
import { publicBotFieldResource } from "../schemas/resource"

const botFieldWorkspaceTokenAPIs = {
  findBotFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/bot-fields/{id}",
      summary: "Get bot field by id",
      tags: ["Bot Fields"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicBotFieldResource)
    .handler(async ({ context, input }) => {
      const botField = await findBotField({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      if (!botField) {
        throw notFoundException("Bot field not found")
      }
      return botField
    }),

  updateBotFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/bot-fields/{id}",
      summary: "Update bot field",
      tags: ["Bot Fields"],
    })
    .input(z.object({ id: zodBigintAsString(), value: z.string() }))
    .output(publicBotFieldResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      return await updateBotField({
        workspaceId: context.workspace.id,
        id,
        parsedInput: rest,
      })
    }),

  deleteBotFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/bot-fields/{id}",
      summary: "Unset the value of the bot field",
      tags: ["Bot Fields"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicBotFieldResource)
    .handler(
      async ({ context, input }) =>
        await updateBotField({
          workspaceId: context.workspace.id,
          id: input.id,
          parsedInput: {
            value: null,
          },
        }),
    ),
}

export default botFieldWorkspaceTokenAPIs
