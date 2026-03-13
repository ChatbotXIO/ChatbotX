import { randomUUID } from "node:crypto"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { env } from "../env"
import type { CreateMcpServerOptions } from "./create-mcp-server"
import { LegacySseTransport } from "./legacy-sse-transport"

type SseSession = {
  server: McpServer
  transport: StreamableHTTPServerTransport
  setApiKey: (apiKey: string | undefined) => void
}

type LegacySseSession = {
  server: McpServer
  transport: LegacySseTransport
  setApiKey: (apiKey: string | undefined) => void
}

const sseSessions = new Map<string, SseSession>()
const legacySseSessions = new Map<string, LegacySseSession>()

const apiTokenHeaderNames = ["x-chatbot-token", "x-chatbo-token"] as const

const resolveHeaderValue = (value: string | string[] | undefined): string => {
  if (typeof value === "string") {
    return value.trim()
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const trimmed = item.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }

  return ""
}

const getApiTokenFromRequest = (req: IncomingMessage): string | undefined => {
  for (const headerName of apiTokenHeaderNames) {
    const token = resolveHeaderValue(req.headers[headerName])
    if (token.length > 0) {
      return token
    }
  }

  return undefined
}

const createSessionApiKeyState = (initialApiKey: string | undefined) => {
  let apiKey = initialApiKey?.trim() || env.CHATBOTX_API_KEY

  return {
    getApiKey: () => apiKey,
    setApiKey: (nextApiKey: string | undefined) => {
      const trimmed = nextApiKey?.trim()
      if (trimmed) {
        apiKey = trimmed
      }
    },
  }
}

const enableCors = (res: ServerResponse): void => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "*")
}

const parseRequestBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }

  if (chunks.length === 0) {
    return undefined
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim()
  if (rawBody.length === 0) {
    return undefined
  }

  return JSON.parse(rawBody) as unknown
}

const getSessionId = (req: IncomingMessage): string | null => {
  const url = new URL(req.url ?? "", "http://localhost")
  const headerSessionId = req.headers["mcp-session-id"]
  if (typeof headerSessionId === "string" && headerSessionId.length > 0) {
    return headerSessionId
  }

  return url.searchParams.get("sessionId")
}

const setSessionIdHeader = (req: IncomingMessage, sessionId: string): void => {
  req.headers["mcp-session-id"] = sessionId
}

const isInitializeRequest = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as { method?: unknown }
  return candidate.method === "initialize"
}

const writePlainText = (
  res: ServerResponse,
  statusCode: number,
  message: string,
): void => {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.end(message)
}

const handleSseRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  createMcpServer: (options?: CreateMcpServerOptions) => McpServer,
): Promise<void> => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== "GET") {
    writePlainText(res, 405, "Method Not Allowed")
    return
  }

  const sessionId = getSessionId(req)
  if (!sessionId) {
    const apiKeyState = createSessionApiKeyState(getApiTokenFromRequest(req))
    const server = createMcpServer({
      getApiKey: apiKeyState.getApiKey,
    })
    const transport = new LegacySseTransport(
      env.CHATBOTX_MCP_MESSAGES_PATH,
      res,
    )
    legacySseSessions.set(transport.sessionId, {
      server,
      transport,
      setApiKey: apiKeyState.setApiKey,
    })

    res.on("close", () => {
      legacySseSessions.delete(transport.sessionId)
    })

    await server.connect(transport)
    return
  }

  const session = sseSessions.get(sessionId)
  if (!session) {
    writePlainText(res, 404, "Unknown sessionId")
    return
  }

  setSessionIdHeader(req, sessionId)
  await session.transport.handleRequest(req, res)
}

const handleMessagesRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  createMcpServer: (options?: CreateMcpServerOptions) => McpServer,
): Promise<void> => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== "POST") {
    writePlainText(res, 405, "Method Not Allowed")
    return
  }

  const sessionId = getSessionId(req)

  try {
    const parsedBody = await parseRequestBody(req)

    if (sessionId) {
      const streamableSession = sseSessions.get(sessionId)
      if (streamableSession) {
        streamableSession.setApiKey(getApiTokenFromRequest(req))
        setSessionIdHeader(req, sessionId)
        await streamableSession.transport.handleRequest(req, res, parsedBody)
        return
      }

      const legacySession = legacySseSessions.get(sessionId)
      if (legacySession) {
        legacySession.setApiKey(getApiTokenFromRequest(req))
        await legacySession.transport.handlePostMessage(req, res, parsedBody)
        return
      }

      writePlainText(res, 404, "Unknown sessionId")
      return
    }

    if (!isInitializeRequest(parsedBody)) {
      writePlainText(
        res,
        400,
        "Missing sessionId. First request must be initialize.",
      )
      return
    }

    const apiKeyState = createSessionApiKeyState(getApiTokenFromRequest(req))
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (initializedSessionId) => {
        sseSessions.set(initializedSessionId, {
          server,
          transport,
          setApiKey: apiKeyState.setApiKey,
        })
      },
    })
    const server = createMcpServer({
      getApiKey: apiKeyState.getApiKey,
    })

    transport.onclose = () => {
      const activeSessionId = transport.sessionId
      if (activeSessionId) {
        sseSessions.delete(activeSessionId)
      }
    }

    await server.connect(transport)
    await transport.handleRequest(req, res, parsedBody)
  } catch {
    writePlainText(res, 400, "Invalid JSON body")
  }
}

export const runSseServer = async (
  createMcpServer: (options?: CreateMcpServerOptions) => McpServer,
): Promise<void> => {
  const httpServer = createServer(async (req, res) => {
    enableCors(res)

    const url = new URL(req.url ?? "", "http://localhost")

    if (url.pathname === env.CHATBOTX_MCP_SSE_PATH) {
      await handleSseRequest(req, res, createMcpServer)
      return
    }

    if (url.pathname === env.CHATBOTX_MCP_MESSAGES_PATH) {
      await handleMessagesRequest(req, res, createMcpServer)
      return
    }

    if (url.pathname === "/") {
      writePlainText(res, 200, "ChatbotX MCP SSE server is running")
      return
    }

    writePlainText(res, 404, "Not Found")
  })

  await new Promise<void>((resolve) => {
    httpServer.listen(env.CHATBOTX_MCP_PORT, env.CHATBOTX_MCP_HOST, resolve)
  })

  console.error(
    `ChatbotX MCP Server running on http://${env.CHATBOTX_MCP_HOST}:${env.CHATBOTX_MCP_PORT}${env.CHATBOTX_MCP_SSE_PATH}`,
  )
}
