import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { env } from "../env"
import { resolveHeaderValue } from "../http-headers"
import {
  buildWwwAuthenticate,
  type ConnectorProfile,
  resolveProfileResourceUrl,
} from "../oauth"
import { introspectToken } from "../token-introspection"
import type { CreateMcpServerOptions } from "./create-mcp-server"
import type { RequestCredentials } from "./execute-tool"
import {
  parseRequestBody,
  writeJsonRpcError,
  writePlainText,
} from "./http-utils"
import { IdleSessionSweeper } from "./session-sweeper"

/** Fixed internal paths; the public paths are `/mcp/openai` and `/mcp/claude`. */
export const OPENAI_INTERNAL_PATH = "/openai"
export const CLAUDE_INTERNAL_PATH = "/claude"

type VerifiedBinding = {
  clientId: string
  issuer: string
  subject: string
  workspaceId: string
}

type ProfileSession = {
  binding: VerifiedBinding
  server: McpServer
  transport: StreamableHTTPServerTransport
}

type CreateMcpServerFn = (options?: CreateMcpServerOptions) => McpServer

type ProfileTransportConfig = {
  /** Internal path the transport is mounted on, e.g. `/openai`. */
  internalPath: string
  profile: ConnectorProfile
  /** Comma-separated Origins allowed in addition to the public URL origin. */
  allowedOrigins: () => string
}

type ProfileRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  createMcpServer: CreateMcpServerFn,
) => Promise<void>

const UNAUTHORIZED_MESSAGE = "Unauthorized: Authentication required"
const UNAVAILABLE_MESSAGE = "Authentication is temporarily unavailable"
const ALLOWED_HEADERS =
  "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, x-workspace-id"

const parseAllowedOrigins = (configured: string): Set<string> => {
  const origins = new Set(
    configured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  )
  if (env.CHATBOTX_MCP_PUBLIC_URL) {
    origins.add(new URL(env.CHATBOTX_MCP_PUBLIC_URL).origin)
  }
  return origins
}

const applyCors = (res: ServerResponse, origin: string | undefined): void => {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS)
  res.setHeader(
    "Access-Control-Expose-Headers",
    "WWW-Authenticate, Mcp-Session-Id",
  )
}

const hasForbiddenCredentialSource = (req: IncomingMessage): boolean => {
  const url = new URL(req.url ?? "", "http://localhost")
  return (
    url.searchParams.has("token") ||
    url.searchParams.has("workspace_token") ||
    resolveHeaderValue(req.headers["x-workspace-token"]) !== "" ||
    resolveHeaderValue(req.headers["x-chatbo-token"]) !== ""
  )
}

const bearerToken = (req: IncomingMessage): string | undefined => {
  const authorization = resolveHeaderValue(req.headers.authorization)
  if (!authorization.startsWith("Bearer ")) {
    return
  }
  return authorization.slice("Bearer ".length).trim() || undefined
}

const requestedWorkspace = (req: IncomingMessage): string | undefined => {
  const url = new URL(req.url ?? "", "http://localhost")
  return (
    url.searchParams.get("workspace_id")?.trim() ||
    resolveHeaderValue(req.headers["x-workspace-id"]) ||
    undefined
  )
}

const sessionIdOf = (req: IncomingMessage): string | undefined =>
  resolveHeaderValue(req.headers["mcp-session-id"]) || undefined

type Authenticated = {
  binding: VerifiedBinding
  credentials: RequestCredentials
}

const sameBinding = (a: VerifiedBinding, b: VerifiedBinding): boolean =>
  a.clientId === b.clientId &&
  a.issuer === b.issuer &&
  a.subject === b.subject &&
  a.workspaceId === b.workspaceId

/**
 * A Streamable HTTP transport for one connector profile: OAuth bearer tokens
 * only, issued for exactly this profile's resource, with its own session
 * store, Origin allow-list and CORS. A session id from one profile (or the
 * default profile) never resolves on another.
 */
export const createProfileTransport = (
  config: ProfileTransportConfig,
): ProfileRequestHandler => {
  const sessions = new Map<string, ProfileSession>()
  const sweeper = new IdleSessionSweeper(async (sessionId) => {
    const session = sessions.get(sessionId)
    sessions.delete(sessionId)
    await session?.transport.close()
  })
  const requestCredentials = new AsyncLocalStorage<RequestCredentials>()

  const authenticate = async (
    req: IncomingMessage,
    res: ServerResponse,
    workspaceFallback: string | undefined,
  ): Promise<Authenticated | undefined> => {
    const challenge = (error?: "invalid_token") =>
      buildWwwAuthenticate(req, config.internalPath, error)
    const token = bearerToken(req)
    if (!token || hasForbiddenCredentialSource(req)) {
      writeJsonRpcError(res, 401, UNAUTHORIZED_MESSAGE, challenge())
      return
    }

    const workspaceId = requestedWorkspace(req) ?? workspaceFallback
    const result = await introspectToken(token, workspaceId)
    if (result.status === "unauthorized") {
      writeJsonRpcError(
        res,
        401,
        UNAUTHORIZED_MESSAGE,
        challenge("invalid_token"),
      )
      return
    }
    if (result.status === "configError") {
      writeJsonRpcError(
        res,
        400,
        "A workspace must be selected for this connection",
      )
      return
    }
    if (result.status !== "ok") {
      writeJsonRpcError(res, 503, UNAVAILABLE_MESSAGE)
      return
    }

    const { principal, workspaceId: verifiedWorkspace } = result.data
    // Not an OAuth access token, an older builder without principal data, or
    // a token issued for another resource (the default `/mcp` or another
    // profile): all are rejected the same way.
    if (
      principal?.credentialType !== "oauth" ||
      principal.audience !== resolveProfileResourceUrl(req, config.profile)
    ) {
      writeJsonRpcError(
        res,
        401,
        UNAUTHORIZED_MESSAGE,
        challenge("invalid_token"),
      )
      return
    }

    return {
      binding: {
        clientId: principal.clientId,
        issuer: principal.issuer,
        subject: principal.subject,
        workspaceId: verifiedWorkspace,
      },
      credentials: { token, workspaceId: verifiedWorkspace },
    }
  }

  const startSession = async (
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
    auth: Authenticated,
    createMcpServer: CreateMcpServerFn,
  ): Promise<void> => {
    const server = createMcpServer({
      getCredentials: () => requestCredentials.getStore(),
      profile: config.profile,
    })
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { binding: auth.binding, server, transport })
        sweeper.touch(sessionId)
      },
    })
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId)
        sweeper.forget(transport.sessionId)
      }
    }
    await server.connect(transport)
    await requestCredentials.run(auth.credentials, () =>
      transport.handleRequest(req, res, body),
    )
  }

  const dispatch: ProfileRequestHandler = async (req, res, createMcpServer) => {
    const origin = resolveHeaderValue(req.headers.origin) || undefined
    if (origin && !parseAllowedOrigins(config.allowedOrigins()).has(origin)) {
      writePlainText(res, 403, "Forbidden origin")
      return
    }
    applyCors(res, origin)

    if (req.method === "OPTIONS") {
      res.statusCode = 204
      res.end()
      return
    }
    if (
      req.method !== "GET" &&
      req.method !== "POST" &&
      req.method !== "DELETE"
    ) {
      writePlainText(res, 405, "Method Not Allowed")
      return
    }

    const sessionId = sessionIdOf(req)
    const session = sessionId ? sessions.get(sessionId) : undefined
    if (sessionId && !session) {
      // Includes ids that belong to the default profile or another profile.
      writePlainText(res, 404, "Unknown sessionId")
      return
    }

    const auth = await authenticate(req, res, session?.binding.workspaceId)
    if (!auth) {
      return
    }
    if (session && !sameBinding(session.binding, auth.binding)) {
      writePlainText(res, 403, "Session belongs to a different identity")
      return
    }

    if (session && sessionId) {
      sweeper.touch(sessionId)
      const body =
        req.method === "POST" ? await parseRequestBody(req) : undefined
      await requestCredentials.run(auth.credentials, () =>
        session.transport.handleRequest(req, res, body),
      )
      return
    }

    if (req.method !== "POST") {
      writePlainText(
        res,
        400,
        "Missing sessionId. First request must be initialize.",
      )
      return
    }
    const body = await parseRequestBody(req)
    if (!isInitializeRequest(body)) {
      writePlainText(
        res,
        400,
        "Missing sessionId. First request must be initialize.",
      )
      return
    }
    await startSession(req, res, body, auth, createMcpServer)
  }

  return async (req, res, createMcpServer) => {
    try {
      await dispatch(req, res, createMcpServer)
    } catch (error) {
      if (error instanceof SyntaxError) {
        writePlainText(res, 400, "Invalid JSON body")
        return
      }
      throw error
    }
  }
}

export const handleOpenAiRequest = createProfileTransport({
  allowedOrigins: () => env.CHATBOTX_MCP_ALLOWED_ORIGINS,
  internalPath: OPENAI_INTERNAL_PATH,
  profile: "openai",
})

export const handleClaudeRequest = createProfileTransport({
  allowedOrigins: () => env.CHATBOTX_MCP_CLAUDE_ALLOWED_ORIGINS,
  internalPath: CLAUDE_INTERNAL_PATH,
  profile: "claude",
})
