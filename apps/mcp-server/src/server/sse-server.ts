import { createHash, randomUUID } from "node:crypto"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { getChildLogger } from "@chatbotx.io/logger"
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
  protectedResourcePrefix,
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
import { createMcpRateLimitGuard } from "./rate-limit"
import { IdleSessionSweeper } from "./session-sweeper"

const logger = getChildLogger("mcp-server")

/**
 * Mutable holder for a session's current credentials. Every request may
 * replace only fields it supplies, so an OAuth caller can select a workspace
 * once and retain it across a Streamable HTTP session.
 */
type CredentialState = { token: string; workspaceId?: string }

/**
 * Who opened a session, from the verified token: the OAuth user and client,
 * or a hash of a workspace token. Undefined when OAuth is disabled and no
 * request is authenticated by this server.
 */
type SessionIdentity = string | undefined

type SseSession = {
  credentialState: CredentialState
  identity: SessionIdentity
  server: McpServer
  transport: StreamableHTTPServerTransport
}

type LegacySseSession = {
  credentialState: CredentialState
  identity: SessionIdentity
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

const queryTokenOf = (req: IncomingMessage): string | undefined => {
  const url = new URL(req.url ?? "", "http://localhost")
  return (
    (
      url.searchParams.get("workspace_token") ?? url.searchParams.get("token")
    )?.trim() || undefined
  )
}

/** Logs (never the token) when a credential arrives in the URL. */
const warnOnQueryToken = (req: IncomingMessage): void => {
  if (!queryTokenOf(req)) {
    return
  }
  const accepted = env.CHATBOTX_MCP_ALLOW_QUERY_TOKEN === "true"
  logger.warn(
    { accepted, path: new URL(req.url ?? "", "http://localhost").pathname },
    accepted
      ? "MCP token sent in the URL query; deprecated, send it as Authorization: Bearer"
      : "MCP token sent in the URL query was ignored (CHATBOTX_MCP_ALLOW_QUERY_TOKEN=false)",
  )
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

  const urlToken = queryTokenOf(req)
  if (urlToken && env.CHATBOTX_MCP_ALLOW_QUERY_TOKEN === "true") {
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

type VerifiedIntrospection = Extract<
  Awaited<ReturnType<typeof introspectToken>>,
  { status: "ok" }
>

/** The verified OAuth audience; other credentials have none. */
const tokenAudiences = (result: VerifiedIntrospection): string[] => {
  const { principal } = result.data
  return principal?.credentialType === "oauth" ? [principal.audience] : []
}

type Authorization = { ok: false } | { ok: true; identity: string }

const UNAUTHORIZED_MESSAGE = "Unauthorized: Authentication required"
// Matches how long token introspection caches an `unavailable` result.
const AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS = "2"

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("base64url")

/**
 * An OAuth session belongs to its user and client, so a refreshed access
 * token keeps it; any other credential is identified by its own hash.
 */
const identityOf = (
  introspection: VerifiedIntrospection,
  token: string,
): string => {
  const { principal } = introspection.data
  return principal?.credentialType === "oauth"
    ? `oauth:${principal.issuer}:${principal.clientId}:${principal.subject}`
    : `token:${hashToken(token)}`
}

const authorizeRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathSuffix: string,
): Promise<Authorization> => {
  const token = getApiTokenFromRequest(req) || env.CHATBOTX_API_KEY
  if (!token) {
    writeJsonRpcError(
      res,
      401,
      UNAUTHORIZED_MESSAGE,
      buildWwwAuthenticate(req, pathSuffix),
    )
    return { ok: false }
  }

  const result = await introspectToken(token, getWorkspaceIdFromRequest(req))
  if (result.status === "unauthorized") {
    writeJsonRpcError(
      res,
      401,
      UNAUTHORIZED_MESSAGE,
      buildWwwAuthenticate(req, pathSuffix, "invalid_token"),
    )
    return { ok: false }
  }
  if (result.status === "configError") {
    writeJsonRpcError(res, 400, result.message)
    return { ok: false }
  }
  // Fails closed, like the connector profiles: introspection and the tool
  // calls hit the same API, so admitting the request would not help it.
  if (result.status !== "ok") {
    res.setHeader("Retry-After", AUTH_UNAVAILABLE_RETRY_AFTER_SECONDS)
    writeJsonRpcError(res, 503, "Authentication is temporarily unavailable")
    return { ok: false }
  }

  // Connector-profile tokens are only valid on their dedicated transport
  // (`/mcp/openai`, `/mcp/claude`); they must not authenticate the default
  // profile and its `call_tool` access to every operation.
  if (tokenAudiences(result).some(isConnectorProfileAudience)) {
    writeJsonRpcError(
      res,
      401,
      UNAUTHORIZED_MESSAGE,
      buildWwwAuthenticate(req, pathSuffix, "invalid_token"),
    )
    return { ok: false }
  }

  return { ok: true, identity: identityOf(result, token) }
}

/** Refuses a request on a session that another identity opened. */
const rejectForeignSession = (
  res: ServerResponse,
  session: { identity: SessionIdentity },
  identity: SessionIdentity,
): boolean => {
  if (session.identity === identity) {
    return false
  }
  writePlainText(res, 403, "Session belongs to a different identity")
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
  identity: SessionIdentity,
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
      identity,
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
  if (rejectForeignSession(res, session, identity)) {
    return
  }
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
  identity: SessionIdentity,
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
        identity,
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
  identity: SessionIdentity,
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
      if (rejectForeignSession(res, resolvedSession.session, identity)) {
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

    await startStreamableSession(
      req,
      res,
      parsedBody,
      createMcpServer,
      identity,
    )
  } catch (error) {
    if (error instanceof SyntaxError) {
      writePlainText(res, 400, "Invalid JSON body")
      return
    }
    throw error
  }
}

const writeProtectedResourceMetadata = (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): boolean => {
  if (
    env.CHATBOTX_MCP_OAUTH_ENABLED !== "true" ||
    !(
      pathname === protectedResourcePrefix ||
      pathname.startsWith(`${protectedResourcePrefix}/`)
    )
  ) {
    return false
  }
  res.statusCode = 200
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Content-Type", "application/json")
  // Resolves the connector profile from the path, or the default resource.
  res.end(JSON.stringify(buildProtectedResourceMetadata(req, pathname)))
  return true
}

/** The default profile's `/sse` and `/messages` routes. */
const handleDefaultProfileRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  createMcpServer: CreateMcpServerFn,
): Promise<void> => {
  warnOnQueryToken(req)
  let identity: SessionIdentity
  if (env.CHATBOTX_MCP_OAUTH_ENABLED === "true" && req.method !== "OPTIONS") {
    const authorization = await authorizeRequest(req, res, route)
    if (!authorization.ok) {
      return
    }
    identity = authorization.identity
  }
  // A POST to the SSE path comes from a Streamable HTTP client pointed at
  // the SSE URL; serve it like the messages path instead of a 405.
  if (route === SSE_ROUTE && req.method !== "POST") {
    await handleSseRequest(req, res, createMcpServer, identity)
    return
  }
  await handleMessagesRequest(req, res, createMcpServer, identity)
}

const isDefaultProfileRoute = (route: string | undefined): route is string =>
  route === SSE_ROUTE || route === MESSAGES_ROUTE

export const createRequestListener = (createMcpServer: CreateMcpServerFn) => {
  const rateLimitGuard = createMcpRateLimitGuard({
    authFailuresPerMinute: env.CHATBOTX_MCP_AUTH_FAILURE_LIMIT_PER_MINUTE,
    credentialOf: getApiTokenFromRequest,
    requestsPerMinute: env.CHATBOTX_MCP_RATE_LIMIT_PER_MINUTE,
    trustedProxyHops: env.CHATBOTX_MCP_TRUSTED_PROXY_HOPS,
  })

  /** Every MCP route, connector profiles included, behind the rate limits. */
  const handleMcpRoute = async (
    req: IncomingMessage,
    res: ServerResponse,
    route: string,
  ): Promise<void> => {
    // Connector profiles: own CORS, Origin check, auth and session store.
    const profileTransport = PROFILE_TRANSPORTS.get(route)
    if (!profileTransport) {
      // Before the limit check, so a browser client can read a 429.
      enableCors(res)
    }
    if (req.method !== "OPTIONS" && !rateLimitGuard.admit(req, res)) {
      return
    }
    try {
      if (profileTransport) {
        await profileTransport(req, res, createMcpServer)
        return
      }
      await handleDefaultProfileRequest(req, res, route, createMcpServer)
    } finally {
      rateLimitGuard.recordOutcome(req, res)
    }
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? "", "http://localhost")
      const route = routeOf(url.pathname)
      if (
        route &&
        (PROFILE_TRANSPORTS.has(route) || isDefaultProfileRoute(route))
      ) {
        await handleMcpRoute(req, res, route)
        return
      }
      enableCors(res)
      if (writeProtectedResourceMetadata(req, res, url.pathname)) {
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
