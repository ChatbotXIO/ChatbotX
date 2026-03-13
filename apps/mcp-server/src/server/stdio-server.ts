import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

export const runStdioServer = async (
  createMcpServer: () => McpServer,
): Promise<void> => {
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("ChatbotX MCP Server running on stdio")
}
