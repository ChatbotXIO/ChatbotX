import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { experimental_createMCPClient, type experimental_MCPClient } from "ai"
import { type NextRequest, NextResponse } from "next/server"
import { validateAIMcpServerRequest } from "@/features/ai-mcp-servers/schemas"
import { serverErrorHandler } from "@/lib/errors/server-handler"

export async function POST(request: NextRequest) {
  const data = await request.json()
  const parsedInput = validateAIMcpServerRequest.parse(data)

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

    const tools = await httpClient.tools()

    return NextResponse.json(tools)
  } catch (error) {
    return serverErrorHandler(error)
  } finally {
    if (httpClient) {
      await httpClient.close()
    }
  }
}
