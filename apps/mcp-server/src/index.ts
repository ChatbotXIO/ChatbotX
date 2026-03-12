import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import "dotenv/config"
import customFields from "./tools/custom-fields.js"
import tags from "./tools/tag.js"
import type { ToolDefinition } from "./types.js"
import { createApi } from "./utils.js"

const server = new McpServer({ name: "ahachat-manager", version: "1.0.0" })

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
