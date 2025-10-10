"use server"

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { experimental_createMCPClient, type experimental_MCPClient } from "ai"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { validateAIMcpServerRequest } from "../schemas"

export const validateAIMcpServerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(validateAIMcpServerRequest)
  .action(async ({ parsedInput }) => {
    const headers: Record<string, string> = {}
    if (parsedInput.auth.type === "TOKEN") {
      headers.Authorization = `Bearer ${parsedInput.auth.token}`
    } else if (parsedInput.auth.type === "HEADERS") {
      for (const header of parsedInput.auth.headers) {
        headers[header.header] = header.value
      }
    }
    let httpClient: experimental_MCPClient | null = null

    try {
      const httpTransport = new StreamableHTTPClientTransport(
        new URL(parsedInput.url),
      )
      httpClient = await experimental_createMCPClient({
        transport: httpTransport,
      })
      return await httpClient.tools()
    } finally {
      if (httpClient) {
        await httpClient.close()
      }
    }
  })
