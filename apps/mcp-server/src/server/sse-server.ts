import { randomUUID } from "node:crypto"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { env } from "../env"
import type { CreateMcpServerOptions } from "./create-mcp-server"

/**
 * Mutable holder for a session's current workspace token. The token
 * captured at connect time (GET `/sse`, or POST `/messages` `initialize`)
 * seeds `current`; every later request routed to the same session can
 * overwrite it if — and only if — that request itself carries a token (see
 * `updateApiKeyStateFromRequest`). `createMcpServer`'s `getApiKey` reads
 * `current` lazily on every tool call, so a token rotated or swapped
 * mid-session takes effect on the next call without a reconnect.
 */
type ApiKeyState = { current: string }

type SseSession = {
  apiKeyState: ApiKeyState
  server: McpServer
  transport: StreamableHTTPServerTransport
}

type LegacySseSession = {
  apiKeyState: ApiKeyState
  server: McpServer
  transport: SSEServerTransport
}

const sseSessions = new Map<string, SseSession>()
const legacySseSessions = new Map<string, LegacySseSession>()

const apiTokenHeaderNames = ["x-workspace-token", "x-chatbo-token"] as const

export const resolveHeaderValue = (
  value: string | string[] | undefined,
): string => {
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

export const getApiTokenFromRequest = (
  req: IncomingMessage,
): string | undefined => {
  const url = new URL(req.url ?? "", "http://localhost")
  const urlToken = (
    url.searchParams.get("workspace_token") ?? url.searchParams.get("token")
  )?.trim()
  if (urlToken) {
    return urlToken
  }

  for (const headerName of apiTokenHeaderNames) {
    const token = resolveHeaderValue(req.headers[headerName])
    if (token.length > 0) {
      return token
    }
  }
}

export const makeApiKeyState = (req: IncomingMessage): ApiKeyState => ({
  current: getApiTokenFromRequest(req) || env.CHATBOTX_API_KEY,
})

/**
 * Priority order is unchanged from connect time
 * (`?workspace_token=`/`?token=` → `x-workspace-token` → `x-chatbo-token`) —
 * only applied per-request instead of once. A request that carries no token
 * of its own (e.g. a bare Streamable HTTP GET for server-initiated
 * messages) leaves `state.current` as it was, so the connect-time or
 * previously-overwritten token keeps serving until a request explicitly
 * supplies a new one.
 */
export const updateApiKeyStateFromRequest = (
  state: ApiKeyState,
  req: IncomingMessage,
): void => {
  const token = getApiTokenFromRequest(req)
  if (token) {
    state.current = token
  }
}

const getApiKeyFromState = (state: ApiKeyState) => (): string => state.current

const enableCors = (res: ServerResponse): void => {
  res.setHeader("Access-Control-Allow-Origin", env.CHATBOTX_MCP_CORS_ORIGIN)
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "*")
}

const parseRequestBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }

  if (chunks.length === 0) {
    return
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim()
  if (rawBody.length === 0) {
    return
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

  // No session ID → old SSE protocol (Claude Desktop, Claude CLI -t sse)
  if (!sessionId) {
    const apiKeyState = makeApiKeyState(req)
    const server = createMcpServer({
      getApiKey: getApiKeyFromState(apiKeyState),
    })
    const transport = new SSEServerTransport(
      env.CHATBOTX_MCP_MESSAGES_PATH,
      res,
    )
    legacySseSessions.set(transport.sessionId, {
      apiKeyState,
      server,
      transport,
    })
    res.on("close", () => legacySseSessions.delete(transport.sessionId))
    await server.connect(transport)
    return
  }

  // Has session ID → Streamable HTTP GET for server-initiated messages
  const session = sseSessions.get(sessionId)
  if (!session) {
    writePlainText(res, 404, "Unknown sessionId")
    return
  }

  updateApiKeyStateFromRequest(session.apiKeyState, req)
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
        updateApiKeyStateFromRequest(streamableSession.apiKeyState, req)
        setSessionIdHeader(req, sessionId)
        await streamableSession.transport.handleRequest(req, res, parsedBody)
        return
      }

      const legacySession = legacySseSessions.get(sessionId)
      if (legacySession) {
        updateApiKeyStateFromRequest(legacySession.apiKeyState, req)
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

    const apiKeyState = makeApiKeyState(req)
    const server = createMcpServer({
      getApiKey: getApiKeyFromState(apiKeyState),
    })
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (initializedSessionId) => {
        sseSessions.set(initializedSessionId, {
          apiKeyState,
          server,
          transport,
        })
      },
    })

    transport.onclose = () => {
      const activeSessionId = transport.sessionId
      if (activeSessionId) {
        sseSessions.delete(activeSessionId)
      }
    }

    await server.connect(transport)
    await transport.handleRequest(req, res, parsedBody)
  } catch (error) {
    if (error instanceof SyntaxError) {
      writePlainText(res, 400, "Invalid JSON body")
      return
    }
    throw error
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
      writePlainText(res, 200, "MCP SSE server is running")
      return
    }

    writePlainText(res, 404, "Not Found")
  })

  await new Promise<void>((resolve) => {
    httpServer.listen(env.CHATBOTX_MCP_PORT, env.CHATBOTX_MCP_HOST, resolve)
  })

  console.error(
    `MCP Server running on http://${env.CHATBOTX_MCP_HOST}:${env.CHATBOTX_MCP_PORT}${env.CHATBOTX_MCP_SSE_PATH}`,
  )
}
