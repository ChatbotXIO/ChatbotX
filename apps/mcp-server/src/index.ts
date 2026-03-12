import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { name as packageName, version as packageVersion } from "../package.json"
import "dotenv/config"
import customFields from "./tools/custom-fields"
import tags from "./tools/tag"
import type { ToolDefinition } from "./types"
import { createApi } from "./utils"

const server = new McpServer({
  name: packageName,
  version: packageVersion,
})

const allTools = {
  ...tags,
  ...customFields,
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
      const api = createApi()
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
