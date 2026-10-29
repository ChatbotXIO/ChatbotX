import { randomUUID } from "node:crypto"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { env } from "../env"
import { buildProtectedResourceMetadata, buildWwwAuthenticate } from "../oauth"
import { introspectToken } from "../token-introspection"
import type { CreateMcpServerOptions } from "./create-mcp-server"

/**
 * Mutable holder for a session's current credentials. Every request may
 * replace only fields it supplies, so an OAuth caller can select a workspace
 * once and retain it across a Streamable HTTP session.
 */
type CredentialState = { token: string; workspaceId?: string }

type SseSession = {
  credentialState: CredentialState
  server: McpServer
  transport: StreamableHTTPServerTransport
}

type LegacySseSession = {
  credentialState: CredentialState
  server: McpServer
  transport: SSEServerTransport
}

type CreateMcpServerFn = (options?: CreateMcpServerOptions) => McpServer

type ResolvedSession =
  | { kind: "streamable"; session: SseSession }
  | { kind: "legacy"; session: LegacySseSession }

const sseSessions = new Map<string, SseSession>()
const legacySseSessions = new Map<string, LegacySseSession>()

const MAX_BODY_BYTES = 1024 * 1024

class PayloadTooLargeError extends Error {}

const resolveSession = (sessionId: string): ResolvedSession | undefined => {
  const streamableSession = sseSessions.get(sessionId)
  if (streamableSession) {
    return { kind: "streamable", session: streamableSession }
  }

  const legacySession = legacySseSessions.get(sessionId)
  if (legacySession) {
    return { kind: "legacy", session: legacySession }
  }
}

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
  const authorization = resolveHeaderValue(req.headers.authorization)
  if (authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim()
    if (token) {
      return token
    }
  }

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

export const getWorkspaceIdFromRequest = (
  req: IncomingMessage,
): string | undefined => {
  const url = new URL(req.url ?? "", "http://localhost")
  return (
    url.searchParams.get("workspace_id")?.trim() ||
    resolveHeaderValue(req.headers["x-workspace-id"]) ||
    undefined
  )
}

export const makeCredentialState = (req: IncomingMessage): CredentialState => ({
  token: getApiTokenFromRequest(req) || env.CHATBOTX_API_KEY,
  workspaceId: getWorkspaceIdFromRequest(req),
})

export const updateCredentialStateFromRequest = (
  state: CredentialState,
  req: IncomingMessage,
): void => {
  const token = getApiTokenFromRequest(req)
  if (token) {
    state.token = token
  }
  const workspaceId = getWorkspaceIdFromRequest(req)
  if (workspaceId) {
    state.workspaceId = workspaceId
  }
}

const getCredentialsFromState = (state: CredentialState) => () =>
  state.token
    ? { token: state.token, workspaceId: state.workspaceId }
    : undefined

const enableCors = (res: ServerResponse): void => {
  res.setHeader("Access-Control-Allow-Origin", env.CHATBOTX_MCP_CORS_ORIGIN)
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "*")
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate")
}

const writeJsonRpcError = (
  res: ServerResponse,
  statusCode: number,
  message: string,
  wwwAuthenticate?: string,
): void => {
  if (wwwAuthenticate) {
    res.setHeader("WWW-Authenticate", wwwAuthenticate)
  }
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32_000, message },
    }),
  )
}

const authorizeRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathSuffix: string,
): Promise<boolean> => {
  const token = getApiTokenFromRequest(req) || env.CHATBOTX_API_KEY
  if (!token) {
    writeJsonRpcError(
      res,
      401,
      "Unauthorized: Authentication required",
      buildWwwAuthenticate(req, pathSuffix),
    )
    return false
  }

  const result = await introspectToken(token, getWorkspaceIdFromRequest(req))
  if (result.status === "unauthorized") {
    writeJsonRpcError(
      res,
      401,
      "Unauthorized: Authentication required",
      buildWwwAuthenticate(req, pathSuffix, "invalid_token"),
    )
    return false
  }
  if (result.status === "configError") {
    writeJsonRpcError(res, 400, result.message)
    return false
  }
  return true
}

const parseRequestBody = async (req: IncomingMessage): Promise<unknown> => {
  const contentLength = Number(
    resolveHeaderValue(req.headers["content-length"]),
  )
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError()
  }

  const chunks: Buffer[] = []
  let bodyBytes = 0
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk
    bodyBytes += buffer.byteLength
    if (bodyBytes > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError()
    }
    chunks.push(buffer)
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
  createMcpServer: CreateMcpServerFn,
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
    const credentialState = makeCredentialState(req)
    const server = createMcpServer({
      getCredentials: getCredentialsFromState(credentialState),
    })
    const transport = new SSEServerTransport(
      env.CHATBOTX_MCP_MESSAGES_PATH,
      res,
    )
    legacySseSessions.set(transport.sessionId, {
      credentialState,
      server,
      transport,
    })
    transport.onclose = () => {
      legacySseSessions.delete(transport.sessionId)
    }
    await server.connect(transport)
    return
  }

  const resolvedSession = resolveSession(sessionId)
  if (resolvedSession?.kind !== "streamable") {
    writePlainText(res, 404, "Unknown sessionId")
    return
  }

  const { session } = resolvedSession
  updateCredentialStateFromRequest(session.credentialState, req)
  setSessionIdHeader(req, sessionId)
  await session.transport.handleRequest(req, res)
}

const startStreamableSession = async (
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody: unknown,
  createMcpServer: CreateMcpServerFn,
): Promise<void> => {
  const credentialState = makeCredentialState(req)
  const server = createMcpServer({
    getCredentials: getCredentialsFromState(credentialState),
  })
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (initializedSessionId) => {
      sseSessions.set(initializedSessionId, {
        credentialState,
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
}

const handleMessagesRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  createMcpServer: CreateMcpServerFn,
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
      const resolvedSession = resolveSession(sessionId)
      if (!resolvedSession) {
        writePlainText(res, 404, "Unknown sessionId")
        return
      }

      updateCredentialStateFromRequest(
        resolvedSession.session.credentialState,
        req,
      )
      if (resolvedSession.kind === "streamable") {
        setSessionIdHeader(req, sessionId)
        await resolvedSession.session.transport.handleRequest(
          req,
          res,
          parsedBody,
        )
        return
      }

      await resolvedSession.session.transport.handlePostMessage(
        req,
        res,
        parsedBody,
      )
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

    await startStreamableSession(req, res, parsedBody, createMcpServer)
  } catch (error) {
    if (error instanceof SyntaxError) {
      writePlainText(res, 400, "Invalid JSON body")
      return
    }
    throw error
  }
}

export const createRequestListener =
  (createMcpServer: CreateMcpServerFn) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      enableCors(res)
      const url = new URL(req.url ?? "", "http://localhost")
      const protectedResourcePrefix = "/.well-known/oauth-protected-resource"
      if (
        env.CHATBOTX_MCP_OAUTH_ENABLED === "true" &&
        (url.pathname === protectedResourcePrefix ||
          url.pathname.startsWith(`${protectedResourcePrefix}/`))
      ) {
        const suffix = url.pathname.slice(protectedResourcePrefix.length)
        res.statusCode = 200
        res.setHeader("Cache-Control", "no-store")
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify(buildProtectedResourceMetadata(req, suffix)))
        return
      }

      if (
        env.CHATBOTX_MCP_OAUTH_ENABLED === "true" &&
        req.method !== "OPTIONS" &&
        (url.pathname === env.CHATBOTX_MCP_SSE_PATH ||
          url.pathname === env.CHATBOTX_MCP_MESSAGES_PATH) &&
        !(await authorizeRequest(req, res, url.pathname))
      ) {
        return
      }
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
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        writePlainText(res, 413, "Payload Too Large")
        return
      }

      console.error("MCP SSE request failed:", error)
      if (res.headersSent) {
        res.end()
        return
      }
      writePlainText(res, 500, "Internal Server Error")
    }
  }

export const runSseServer = async (
  createMcpServer: CreateMcpServerFn,
): Promise<void> => {
  const httpServer = createServer(createRequestListener(createMcpServer))
  const { promise: listening, resolve } = Promise.withResolvers<void>()
  httpServer.listen(env.CHATBOTX_MCP_PORT, env.CHATBOTX_MCP_HOST, resolve)
  await listening

  console.error(
    `MCP Server running on http://${env.CHATBOTX_MCP_HOST}:${env.CHATBOTX_MCP_PORT}${env.CHATBOTX_MCP_SSE_PATH}`,
  )
}
