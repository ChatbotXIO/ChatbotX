"use server"

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp"
import { assertSafeMcpEndpoint } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { aiMcpServerAuthTypes } from "@chatbotx.io/database/partials"
import { resolveBotFieldVariableText } from "@chatbotx.io/variables/bot-field-variable-resolver"
import type { ValidatePrivateAIMcpServerRequest } from "../schema/action"

export const validateAIMcpServer = async ({
  parsedInput,
}: {
  parsedInput: ValidatePrivateAIMcpServerRequest & { workspaceId: string }
}) => {
  await assertSafeMcpEndpoint(parsedInput.url)

  const headers: Record<string, string> = {}
  if (parsedInput.auth.type === aiMcpServerAuthTypes.enum.token) {
    const resolution = await resolveBotFieldVariableText({
      text: parsedInput.auth.token,
      workspaceId: parsedInput.workspaceId,
    })
    if (resolution.status !== "resolved") {
      throw new ChatbotXException(
        "Unable to validate MCP server.",
        "invalidMcpTokenTemplate",
        400,
      )
    }
    headers.Authorization = `Bearer ${resolution.value}`
  } else if (parsedInput.auth.type === aiMcpServerAuthTypes.enum.header) {
    for (const header of parsedInput.auth.headers) {
      headers[header.header] = header.value
    }
  }

  let httpClient: MCPClient | null = null

  try {
    httpClient = await createMCPClient({
      transport: {
        type: "http",
        url: parsedInput.url,
        headers,
        redirect: "error",
      },
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
