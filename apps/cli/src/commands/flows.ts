import type { ChatbotXAPI } from "@chatbotx/public-apis"
import { listFlows as listFlowsApi } from "@chatbotx/public-apis"
import { createApiClient } from "../config"
import { printResult } from "./utils"

type FlowCommand = {
  name: string
  args: []
  execute: (api: ChatbotXAPI) => Promise<unknown>
}

type FlowCommandParams = Record<string, string>

export type FlowCommandName = keyof typeof flowCommands

export const executeFlowCommand = async (
  commandName: FlowCommandName,
  _params: FlowCommandParams = {},
): Promise<void> => {
  const api = createApiClient()
  const result = await flowCommands[commandName].execute(api)
  printResult(result)
}

export const flowCommands = {
  "flows:list": {
    name: "List all flows",
    args: [],
    execute: (api: ChatbotXAPI) => listFlowsApi(api),
  },
} satisfies Record<string, FlowCommand>
