import type { ChatbotXAPI } from "@chatbotx/public-apis"
import { listBroadcasts as listBroadcastsApi } from "@chatbotx/public-apis"
import { createApiClient } from "../config"
import { printResult } from "./utils"

type BroadcastCommand = {
  name: string
  args: []
  execute: (api: ChatbotXAPI) => Promise<unknown>
}

type BroadcastCommandParams = Record<string, string>

export type BroadcastCommandName = keyof typeof broadcastCommands

export const executeBroadcastCommand = async (
  commandName: BroadcastCommandName,
  _params: BroadcastCommandParams = {},
): Promise<void> => {
  const api = createApiClient()
  const result = await broadcastCommands[commandName].execute(api)
  printResult(result)
}

export const broadcastCommands = {
  "broadcasts:list": {
    name: "List all broadcasts",
    args: [],
    execute: (api: ChatbotXAPI) => listBroadcastsApi(api),
  },
} satisfies Record<string, BroadcastCommand>
