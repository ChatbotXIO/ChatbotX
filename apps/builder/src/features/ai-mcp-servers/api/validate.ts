import { AIMcpServerAuthType } from "@aha.chat/database/types"
import {
  experimental_createMCPClient,
  type experimental_MCPClient,
} from "@ai-sdk/mcp"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import z from "zod"
import { withChatbotIdSchema } from "@/features/chatbots/schemas/resource"
import { serverErrorHandler } from "@/lib/errors/server-handler"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { validateAIMcpServerRequest } from "../schemas"

export const validateAIMcpServer = authorizedAPI
  .route({
    method: "POST",
    path: "/chatbots/{chatbotId}/ai-mcp-servers/validate",
    summary: "Validate an MCP server",
    tags: ["AI"],
  })
  .input(validateAIMcpServerRequest.and(withChatbotIdSchema))
  .use(chatbotAuthMiddleware, (input) => input.chatbotId)
  .output(z.any())
  .handler(async ({ input }) => {
    const headers: Record<string, string> = {}
    if (input.auth.type === AIMcpServerAuthType.token) {
      headers.Authorization = `Bearer ${input.auth.token}`
    } else if (input.auth.type === AIMcpServerAuthType.header) {
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
  })
