import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { CreateMcpServerOptions } from "./create-mcp-server"

export const runStdioServer = async (
  createMcpServer: (options?: CreateMcpServerOptions) => McpServer,
): Promise<void> => {
  const server = createMcpServer()

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("MCP Server running on stdio")
}
