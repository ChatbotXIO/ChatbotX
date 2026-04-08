"use server"

import {
  experimental_createMCPClient,
  type experimental_MCPClient,
} from "@ai-sdk/mcp"
import { aiMcpServerAuthTypes } from "@chatbotx.io/database/partials"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { validateAIMcpServerRequest } from "../schema/action"

export const validateAIMcpServerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(validateAIMcpServerRequest)
  .action(async ({ parsedInput }) => {
    const headers: Record<string, string> = {}
    if (parsedInput.auth.type === aiMcpServerAuthTypes.enum.token) {
      headers.Authorization = `Bearer ${parsedInput.auth.token}`
    } else if (parsedInput.auth.type === aiMcpServerAuthTypes.enum.header) {
      for (const header of parsedInput.auth.headers) {
        headers[header.header] = header.value
      }
    }

    let httpClient: experimental_MCPClient | null = null

    try {
      const httpTransport = new StreamableHTTPClientTransport(
        new URL(parsedInput.url),
        { requestInit: { headers } },
      )
      httpClient = await experimental_createMCPClient({
        transport: httpTransport,
      })

      const tools = await httpClient.tools()
      const toolKeys = Object.keys(tools)

      return JSON.parse(
        JSON.stringify(
          Object.fromEntries(toolKeys.map((key) => [key, tools[key]])),
        ),
      )
    } finally {
      if (httpClient) {
        await httpClient.close()
      }
    }
  })
