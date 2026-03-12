import { createRequire } from "node:module"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import "dotenv/config"
import customFields from "./tools/custom-fields.js"
import tags from "./tools/tag.js"
import type { ToolDefinition } from "./types.js"
import { createApi } from "./utils.js"

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

const transport = new StdioServerTransport()
await server.connect(transport)
console.log("MCP Server running...")
