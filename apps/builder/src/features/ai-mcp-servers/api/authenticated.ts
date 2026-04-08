import {
  experimental_createMCPClient,
  type experimental_MCPClient,
} from "@ai-sdk/mcp"
import { aiMcpServerAuthTypes } from "@chatbotx.io/database/partials"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAIMcpServers } from "../queries"
import {
  listAIMcpServersRequest,
  listAIMcpServersResponse,
  validateAIMcpServerRequest,
} from "../schema/action"

export const aiMcpServersAuthenticatedAPI = {
  validateAIMcpServerAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/ai-mcp-servers/validate",
      summary: "Validate an MCP server",
      tags: ["AI"],
    })
    .input(validateAIMcpServerRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.any())
    .handler(async ({ input }) => {
      const headers: Record<string, string> = {}
      if (input.auth.type === aiMcpServerAuthTypes.enum.token) {
        headers.Authorization = `Bearer ${input.auth.token}`
      } else if (input.auth.type === aiMcpServerAuthTypes.enum.header) {
        for (const header of input.auth.headers) {
          headers[header.header] = header.value
        }
      }
      let httpClient: experimental_MCPClient | null = null

      try {
        const httpTransport = new StreamableHTTPClientTransport(
          new URL(input.url),
        )
        httpClient = await experimental_createMCPClient({
          transport: httpTransport,
        })

        return await httpClient.tools()
      } catch (error) {
        return serverErrorHandler(error)
      } finally {
        if (httpClient) {
          await httpClient.close()
        }
      }
    }),
  listAIMcpServersAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/ai-mcp-servers",
      summary: "List AI MCP servers",
      tags: ["AI MCP Servers"],
    })
    .input(listAIMcpServersRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAIMcpServersResponse)
    .handler(async ({ input }) => {
      return await listAIMcpServers(input)
    }),
}
