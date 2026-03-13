import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { name as packageName, version as packageVersion } from "../package.json"
import "dotenv/config"
import { createChatbotXAPI } from "@chatbotx/public-apis"
import { env } from "./env"
import botFields from "./tools/bot-fields"
import broadcasts from "./tools/broadcasts"
import contacts from "./tools/contacts"
import customFields from "./tools/custom-fields"
import flows from "./tools/flows"
import tags from "./tools/tag"
import type { ToolDefinition } from "./types"

const server = new McpServer({
  name: packageName,
  version: packageVersion,
})

const allTools = {
  ...botFields,
  ...broadcasts,
  ...contacts,
  ...tags,
  ...customFields,
  ...flows,
}

// loop all tools and register to server
for (const [key, tool] of Object.entries(allTools)) {
  const { description, execute } = tool as ToolDefinition
  server.registerTool(
    key,
    {
      description,
    },
    async (input) => {
      const api = createChatbotXAPI({
        apiKey: env.CHATBOTX_API_KEY ?? "",
        apiUrl: env.CHATBOTX_API_URL ?? "",
        allowSelfSignedCert: env.CHATBOTX_ALLOW_SELF_SIGNED_CERT === "true",
      })
      const result = await execute(api, input)
      return result
    },
  )
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("ChatbotX MCP Server running on stdio")
}

main().catch((error) => {
  console.error("Fatal error in main():", error)
  process.exit(1)
})
