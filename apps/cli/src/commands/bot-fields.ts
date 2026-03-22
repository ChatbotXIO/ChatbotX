import type { ChatbotXAPI } from "@chatbotx/public-apis"
import {
  deleteBotField as deleteBotFieldApi,
  getBotField as getBotFieldApi,
  updateBotField as updateBotFieldApi,
} from "@chatbotx/public-apis"
import { createApiClient } from "../config"
import { type CommandArg, printResult, validateCommandArgs } from "./utils"

type BotFieldCommandParams = Partial<
  Parameters<typeof getBotFieldApi>[1] &
    Parameters<typeof updateBotFieldApi>[1] &
    Parameters<typeof deleteBotFieldApi>[1]
>

type BotFieldParamKey = keyof Required<BotFieldCommandParams>

type BotFieldCommandArg = CommandArg<BotFieldParamKey>

type BotFieldCommand = {
  name: string
  args: BotFieldCommandArg[]
  execute: (api: ChatbotXAPI, params: BotFieldCommandParams) => Promise<unknown>
}

export type BotFieldCommandName = keyof typeof botFieldCommands

export const executeBotFieldCommand = async (
  commandName: BotFieldCommandName,
  params: BotFieldCommandParams = {},
): Promise<void> => {
  validateCommandArgs(commandName, params, botFieldCommands)
  const api = createApiClient()
  const result = await botFieldCommands[commandName].execute(api, params)
  printResult(result)
}

export const botFieldCommands = {
  "bot-fields:show": {
    name: "Get bot field by ID",
    args: [
      {
        key: "id",
        description: "Bot field ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: BotFieldCommandParams) =>
      getBotFieldApi(api, { id: params.id ?? "" }),
  },
  "bot-fields:update": {
    name: "Update bot field value",
    args: [
      {
        key: "id",
        description: "Bot field ID",
        required: true,
      },
      {
        key: "value",
        description: "Bot field value",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: BotFieldCommandParams) =>
      updateBotFieldApi(api, {
        id: params.id ?? "",
        value: params.value ?? "",
      }),
  },
  "bot-fields:delete": {
    name: "Unset bot field value",
    args: [
      {
        key: "id",
        description: "Bot field ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: BotFieldCommandParams) =>
      deleteBotFieldApi(api, { id: params.id ?? "" }),
  },
} satisfies Record<string, BotFieldCommand>
