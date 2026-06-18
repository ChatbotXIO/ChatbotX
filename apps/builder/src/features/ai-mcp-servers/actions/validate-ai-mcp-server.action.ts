"use server"

import {
  experimental_createMCPClient,
  type experimental_MCPClient,
} from "@ai-sdk/mcp"
import { aiMcpServerAuthTypes } from "@chatbotx.io/database/partials"
import type { ValidateAIMcpServerRequest } from "../schemas/action"

export const validateAIMcpServer = async ({
  parsedInput,
}: {
  parsedInput: ValidateAIMcpServerRequest
}) => {
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
    httpClient = await experimental_createMCPClient({
      transport: { type: "http", url: parsedInput.url, headers },
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
}
