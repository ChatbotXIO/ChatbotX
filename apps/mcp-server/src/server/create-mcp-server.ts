import { createChatbotXAPI } from "@chatbotx/public-apis"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  name as packageName,
  version as packageVersion,
} from "../../package.json"
import { env } from "../env"
import botFields from "../tools/bot-fields"
import broadcasts from "../tools/broadcasts"
import contacts from "../tools/contacts"
import customFields from "../tools/custom-fields"
import flows from "../tools/flows"
import tags from "../tools/tag"
import type { ToolDefinition } from "../types"

const allTools = {
  ...botFields,
  ...broadcasts,
  ...contacts,
  ...tags,
  ...customFields,
  ...flows,
}

export type CreateMcpServerOptions = {
  getApiKey?: () => string
}

export const createMcpServer = (
  options?: CreateMcpServerOptions,
): McpServer => {
  const server = new McpServer({
    name: packageName,
    version: packageVersion,
  })

  const getApiKey = () => {
    const tokenFromRequest = options?.getApiKey?.().trim()
    if (tokenFromRequest) {
      return tokenFromRequest
    }

    return env.CHATBOTX_API_KEY
  }

  for (const [key, tool] of Object.entries(allTools)) {
    const { description, execute, inputSchema } = tool as ToolDefinition
    server.registerTool(
      key,
      {
        description,
        inputSchema,
      },
      async (input) => {
        const api = createChatbotXAPI({
          apiKey: getApiKey(),
          apiUrl: env.CHATBOTX_API_URL ?? "",
          allowSelfSignedCert: env.CHATBOTX_ALLOW_SELF_SIGNED_CERT === "true",
        })
        return await execute(api, input)
      },
    )
  }

  return server
}
