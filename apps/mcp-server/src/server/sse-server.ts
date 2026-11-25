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
import { resolveHeaderValue } from "../http-headers"
import {
  buildProtectedResourceMetadata,
  buildWwwAuthenticate,
  isConnectorProfileAudience,
  profileForPath,
  protectedResourcePrefix,
  unverifiedJwtAudiences,
} from "../oauth"
import { introspectToken } from "../token-introspection"
import type { CreateMcpServerOptions } from "./create-mcp-server"
import {
  PayloadTooLargeError,
  parseRequestBody,
  writeJsonRpcError,
  writePlainText,
} from "./http-utils"
import {
  CLAUDE_INTERNAL_PATH,
  handleClaudeRequest,
  handleOpenAiRequest,
  OPENAI_INTERNAL_PATH,
} from "./profile-transport"
import { IdleSessionSweeper } from "./session-sweeper"

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

const sseSweeper = new IdleSessionSweeper(async (sessionId) => {
  const session = sseSessions.get(sessionId)
  sseSessions.delete(sessionId)
  await session?.transport.close()
})
const legacySweeper = new IdleSessionSweeper(async (sessionId) => {
  const session = legacySseSessions.get(sessionId)
  legacySseSessions.delete(sessionId)
  await session?.transport.close()
})

/** Refreshes the idle timer of whichever map owns the session. */
const touchSession = (resolved: ResolvedSession, sessionId: string): void => {
  const sweeper = resolved.kind === "streamable" ? sseSweeper : legacySweeper
  sweeper.touch(sessionId)
}

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

const SSE_ROUTE = "/sse"
const MESSAGES_ROUTE = "/messages"

/** The full request path of a route below `CHATBOTX_MCP_BASE_PATH`. */
const mcpPath = (route: string): string =>
  `${env.CHATBOTX_MCP_BASE_PATH}${route}`

/** The route below `CHATBOTX_MCP_BASE_PATH`, or undefined outside it. */
const routeOf = (pathname: string): string | undefined => {
  const base = env.CHATBOTX_MCP_BASE_PATH
  if (!base) {
    return pathname
  }
  return pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length)
    : undefined
}

/** Each connector profile's dedicated transport, keyed by route. */
const PROFILE_TRANSPORTS = new Map([
  [OPENAI_INTERNAL_PATH, handleOpenAiRequest],
  [CLAUDE_INTERNAL_PATH, handleClaudeRequest],
])

const apiTokenHeaderNames = ["x-workspace-token", "x-chatbo-token"] as const

export { resolveHeaderValue } from "../http-headers"

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

/** Verified OAuth audience when introspection succeeded, else the raw claim. */
const tokenAudiences = (
  result: Awaited<ReturnType<typeof introspectToken>>,
  token: string,
): string[] => {
  if (result.status !== "ok") {
    return unverifiedJwtAudiences(token)
  }
  const { principal } = result.data
  return principal?.credentialType === "oauth" ? [principal.audience] : []
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

  // Connector-profile tokens are only valid on their dedicated transport
  // (`/mcp/openai`, `/mcp/claude`); they must not authenticate the default
  // profile and its `call_tool` access to every operation.
  // While introspection is unavailable (fail-open below) the token's own,
  // unverified `aud` still decides the reject: it can only refuse, never admit.
  if (tokenAudiences(result, token).some(isConnectorProfileAudience)) {
    writeJsonRpcError(
      res,
      401,
      "Unauthorized: Authentication required",
      buildWwwAuthenticate(req, pathSuffix, "invalid_token"),
    )
    return false
  }

  // `unavailable` fails open here and in tools/list filtering; the actual
  // API call still enforces the token before any workspace data is accessed.
  return true
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
    const transport = new SSEServerTransport(mcpPath(MESSAGES_ROUTE), res)
    legacySseSessions.set(transport.sessionId, {
      credentialState,
      server,
      transport,
    })
    legacySweeper.touch(transport.sessionId)
    transport.onclose = () => {
      legacySseSessions.delete(transport.sessionId)
      legacySweeper.forget(transport.sessionId)
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
  touchSession(resolvedSession, sessionId)
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
      sseSweeper.touch(initializedSessionId)
    },
  })

  transport.onclose = () => {
    const activeSessionId = transport.sessionId
    if (activeSessionId) {
      sseSessions.delete(activeSessionId)
      sseSweeper.forget(activeSessionId)
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

      touchSession(resolvedSession, sessionId)
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
      const url = new URL(req.url ?? "", "http://localhost")
      const route = routeOf(url.pathname)
      // Connector profiles: own CORS, Origin check, auth and session store.
      const profileTransport = route && PROFILE_TRANSPORTS.get(route)
      if (profileTransport) {
        await profileTransport(req, res, createMcpServer)
        return
      }
      enableCors(res)
      if (
        env.CHATBOTX_MCP_OAUTH_ENABLED === "true" &&
        url.pathname.startsWith(`${protectedResourcePrefix}/`) &&
        profileForPath(url.pathname)
      ) {
        res.statusCode = 200
        res.setHeader("Cache-Control", "no-store")
        res.setHeader("Content-Type", "application/json")
        res.end(
          JSON.stringify(buildProtectedResourceMetadata(req, url.pathname)),
        )
        return
      }
      if (
        env.CHATBOTX_MCP_OAUTH_ENABLED === "true" &&
        (url.pathname === protectedResourcePrefix ||
          url.pathname.startsWith(`${protectedResourcePrefix}/`))
      ) {
        res.statusCode = 200
        res.setHeader("Cache-Control", "no-store")
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify(buildProtectedResourceMetadata(req)))
        return
      }

      if (
        env.CHATBOTX_MCP_OAUTH_ENABLED === "true" &&
        req.method !== "OPTIONS" &&
        (route === SSE_ROUTE || route === MESSAGES_ROUTE) &&
        !(await authorizeRequest(req, res, route))
      ) {
        return
      }
      // A POST to the SSE path comes from a Streamable HTTP client pointed at
      // the SSE URL; serve it like the messages path instead of a 405.
      if (route === SSE_ROUTE && req.method === "POST") {
        await handleMessagesRequest(req, res, createMcpServer)
        return
      }

      if (route === SSE_ROUTE) {
        await handleSseRequest(req, res, createMcpServer)
        return
      }

      if (route === MESSAGES_ROUTE) {
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

const REMOVED_PATH_VARIABLES = [
  "CHATBOTX_MCP_MESSAGES_PATH",
  "CHATBOTX_MCP_SSE_PATH",
] as const

/**
 * Refuses to start while a removed per-route path variable is still set to a
 * non-empty value: ignoring it would silently move the routes and break every
 * client. An empty value (e.g. a compose `${VAR:-}` default) names no route.
 */
export const assertMcpPathConfig = (): void => {
  const stale = REMOVED_PATH_VARIABLES.filter((name) =>
    Boolean(process.env[name]),
  )
  if (stale.length > 0) {
    throw new Error(
      `${stale.join(", ")} ${stale.length > 1 ? "were" : "was"} removed. Set CHATBOTX_MCP_BASE_PATH to the shared prefix instead (for example "/mcp" for /mcp/messages and /mcp/sse) and unset the old variable.`,
    )
  }
}

export const runSseServer = async (
  createMcpServer: CreateMcpServerFn,
): Promise<void> => {
  assertMcpPathConfig()
  const httpServer = createServer(createRequestListener(createMcpServer))
  const { promise: listening, resolve } = Promise.withResolvers<void>()
  httpServer.listen(env.CHATBOTX_MCP_PORT, env.CHATBOTX_MCP_HOST, resolve)
  await listening

  console.error(
    `MCP Server running on http://${env.CHATBOTX_MCP_HOST}:${env.CHATBOTX_MCP_PORT}${mcpPath(SSE_ROUTE)}`,
  )
}
