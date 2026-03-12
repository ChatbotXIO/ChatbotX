import { createRequire } from "node:module"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import "dotenv/config"
import customFields from "./tools/custom-fields"
import tags from "./tools/tag"
import type { ToolDefinition } from "./types"
import { createApi } from "./utils"

const require = createRequire(import.meta.url)
const packageJson = require("../package.json") as {
  name: string
  version: string
}

const server = new McpServer({
  name: packageJson.name,
  version: packageJson.version,
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
  console.error("Weather MCP Server running on stdio")
}

main().catch((error) => {
  console.error("Fatal error in main():", error)
  process.exit(1)
})
