import {
  McpTokenVerificationUnavailableError,
  verifyMcpAccessToken,
} from "@chatbotx.io/auth/mcp-resource"
import { isMobileAccessTokenCandidate } from "@chatbotx.io/auth/mobile-resource-candidate"
import {
  isWorkspaceScheduledForDeletion,
  mcpOAuthService,
  workspaceApiTokenService,
} from "@chatbotx.io/business"
import { withAuditContext } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { hashToken } from "@chatbotx.io/business/workspace-api-token/credentials"
import type {
  WorkspaceApiTokenModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { ORPCError } from "@orpc/server"
import { logger } from "@/lib/log"
import { mobileCredentialId } from "@/lib/mobile-auth/mobile-credential-id"
import {
  type MobileWorkspacePrincipal,
  resolveMobileWorkspacePrincipal,
} from "@/lib/mobile-auth/resolve-mobile-workspace-principal"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"
import {
  assertWorkspaceOwnerAccessForMethod,
  isReadOnlyTokenAllowedMethod,
} from "@/lib/workspace/authorize-workspace-access"
import { type BaseContext, base, type RequestApiToken } from "./context"

const assertNotRateLimited = (
  workspaceId: string,
  resHeaders?: Headers,
): Promise<void> =>
  assertApiNotRateLimited({
    scope: "workspace-token-rate-limit",
    key: workspaceId,
    resHeaders,
  })

// Generous ceiling: this bucket aggregates every workspace behind one egress
// IP, so it must sit well above the per-workspace limit — it only exists to
// stop unauthenticated token-guessing floods, which the per-workspace
// limiter below can never see (an invalid token resolves to no workspace).
const PREAUTH_REQUEST_LIMIT = 600

export const assertPreAuthNotRateLimited = (
  headers: Headers,
  resHeaders?: Headers,
): Promise<void> =>
  assertApiNotRateLimited({
    scope: "workspace-token-preauth-rate-limit",
    key: getGuestClientIp(headers),
    limit: PREAUTH_REQUEST_LIMIT,
    resHeaders,
  })

const JWT_SEGMENT_COUNT = 3

export const extractBearer = (headers: Headers): string | null => {
  const authorization = headers.get("Authorization")
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null
}

const invalidTokenError = () =>
  new ORPCError("INVALID_CHATBOT_TOKEN", {
    status: 401,
    message: "Invalid or missing workspace API token",
  })

export const workspaceTokenAuthMidddleware = base.middleware(
  async ({ context, next, procedure }) => {
    // Read before any membership lookup so a permission change racing this
    // request is detected by the realtime gateway (see realtime connect token).
    const requestIssuedAtMs = Date.now()
    const bearerToken = extractBearer(context.headers)
    // Deprecated: accepting the token as a query param leaks it into access
    // logs and browser history. Kept temporarily for existing integrations;
    // logged below so we can see when it's safe to remove.
    const url = context.url ? new URL(context.url) : null
    const apiKeyToken = url?.searchParams.get("token") ?? null
    const token = bearerToken ?? apiKeyToken
    const requestedWorkspaceId =
      context.headers.get("x-workspace-id")?.trim() || undefined
    if (!token) {
      throw invalidTokenError()
    }
    if (!bearerToken && apiKeyToken) {
      logger.warn(
        { path: url?.pathname },
        "Workspace token authenticated via deprecated ?token= query param",
      )
    }

    // The IP-keyed gate must run BEFORE hashing/looking up the token: it
    // exists to stop unauthenticated token-guessing floods, and a request
    // already over the ceiling must not pay for a hash + DB/Redis lookup.
    await assertPreAuthNotRateLimited(context.headers, context.resHeaders)

    let mobile: MobileWorkspacePrincipal | undefined
    let workspaceTokenAuth:
      | { workspace: WorkspaceModel; apiToken: WorkspaceApiTokenModel }
      | undefined

    if (bearerToken && isMobileAccessTokenCandidate(bearerToken)) {
      mobile = await resolveMobileWorkspacePrincipal({
        bearerToken,
        requestedWorkspaceId,
        method: procedure["~orpc"].route.method,
        path: procedure["~orpc"].route.path,
      })
    } else {
      const tokenHash = await hashToken(token)
      try {
        workspaceTokenAuth =
          await workspaceApiTokenService.findWorkspaceByTokenHash({
            tokenHash,
          })
      } catch (error) {
        // The token-row cache (up to 300s TTL) can outlive the workspace it
        // points at if a purge runs before the tag is invalidated — the
        // service's findById then throws notFound instead of returning. That's
        // an auth failure from the caller's perspective, not a server error.
        if (error instanceof ChatbotXException && error.code === "notFound") {
          logger.warn(
            { err: error, tokenHash },
            "Workspace token cache pointed at a purged workspace",
          )
          throw invalidTokenError()
        }
        throw error
      }
    }

    let resolved: {
      workspace: WorkspaceModel
      apiToken: RequestApiToken
      audit: { userId: string; source: string }
    }
    if (workspaceTokenAuth) {
      resolved = {
        workspace: workspaceTokenAuth.workspace,
        apiToken: {
          id: workspaceTokenAuth.apiToken.id,
          workspaceId: workspaceTokenAuth.apiToken.workspaceId,
          permission: workspaceTokenAuth.apiToken.permission,
          scopes: workspaceTokenAuth.apiToken.scopes,
          isDefault: workspaceTokenAuth.apiToken.isDefault,
        },
        // API-token calls are attributed to the workspace owner because an
        // opaque token has no individual user identity to audit.
        audit: {
          userId: workspaceTokenAuth.workspace.ownerId,
          source: `api-token:${workspaceTokenAuth.apiToken.id}`,
        },
      }
    } else if (mobile) {
      resolved = {
        workspace: mobile.workspace,
        apiToken: mobile.apiToken,
        audit: {
          userId: mobile.user.id,
          source: `mobile:${mobile.deviceId ?? "unknown"}`,
        },
      }
    } else {
      if (!bearerToken || bearerToken.split(".").length !== JWT_SEGMENT_COUNT) {
        throw invalidTokenError()
      }

      // OAuth access tokens are JWTs. Mobile-token candidates were resolved
      // before hashing, so this fallback verifies only MCP OAuth credentials.
      const { auth } = await import("@/lib/auth/auth")
      const mcpAccessToken = await verifyMcpAccessToken(
        auth,
        bearerToken,
      ).catch((error: unknown) => {
        if (error instanceof McpTokenVerificationUnavailableError) {
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Token verification is temporarily unavailable",
          })
        }
        throw error
      })
      if (!mcpAccessToken) {
        throw invalidTokenError()
      }

      // OAuth calls retain the real user identity and OAuth client source.
      const oauth = await mcpOAuthService.resolvePrincipal({
        clientId: mcpAccessToken.clientId,
        userId: mcpAccessToken.userId,
        workspaceId: requestedWorkspaceId,
      })

      if (oauth.kind === "invalidToken") {
        throw invalidTokenError()
      }
      if (oauth.kind === "forbidden") {
        throw new ORPCError("FORBIDDEN", {
          message: "Account has no access to this workspace",
        })
      }
      if (oauth.kind === "workspaceSelectionRequired") {
        const workspaces = oauth.workspaces
          .map((workspace) => `${workspace.id} (${workspace.name})`)
          .join(", ")
        throw new ORPCError("WORKSPACE_SELECTION_REQUIRED", {
          status: 400,
          message: `This account has access to ${oauth.workspaces.length} workspaces. Disconnect and reconnect this MCP client to choose one on the consent screen, or add ?workspace_id=<id> to the MCP server URL (or send the x-workspace-id header). Available: ${workspaces}`,
        })
      }

      resolved = {
        workspace: oauth.principal.workspace,
        apiToken: {
          id: `oauth:${oauth.principal.clientId}:${oauth.principal.user.id}`,
          workspaceId: oauth.principal.workspace.id,
          permission: "full",
          scopes: null,
          isDefault: false,
        },
        audit: {
          userId: oauth.principal.user.id,
          source: `mcp-oauth:${oauth.principal.clientId}`,
        },
      }
    }
    const { workspace, apiToken } = resolved

    // A mobile principal is limited per user, not through the workspace
    // bucket shared by every API token and integration of the workspace.
    await (mobile
      ? assertApiNotRateLimited({
          scope: "mobile-user-rate-limit",
          key: mobile.user.id,
          resHeaders: context.resHeaders,
        })
      : assertNotRateLimited(workspace.id, context.resHeaders))

    if (isWorkspaceScheduledForDeletion(workspace)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace deletion scheduled",
      })
    }

    const method = procedure["~orpc"].route.method
    const path = procedure["~orpc"].route.path

    // Read-only tokens may only GET/HEAD (plus a narrow, explicit allowlist
    // of POST-for-read routes — see `READ_ONLY_TOKEN_ALLOWED_POST_PATHS`) —
    // unlike the owner-quota gate below, DELETE is not exempt here: a
    // read_only token must not be able to delete data. Checked before the
    // owner-quota gate — no DB call needed to enforce this.
    if (
      apiToken.permission === "read_only" &&
      !isReadOnlyTokenAllowedMethod(method, path)
    ) {
      throw new ORPCError("FORBIDDEN", {
        message: "Read-only token cannot perform this operation",
      })
    }

    // Owner-quota/trial gate — mirrors workspaceActionClient in safe-action.ts.
    // Reads and deletes stay open (invariant #14).
    await assertWorkspaceOwnerAccessForMethod({
      method,
      path,
      ownerId: workspace.ownerId,
    })

    let apiCredentialId = resolved.audit.source
    if (workspaceTokenAuth) {
      apiCredentialId = `api-token:${apiToken.id}`
    }
    if (mobile) {
      apiCredentialId = mobileCredentialId(mobile)
    }

    return await withAuditContext(
      {
        userId: resolved.audit.userId,
        workspaceId: workspace.id,
        ipAddress: getGuestClientIp(context.headers),
        userAgent: context.headers.get("user-agent") ?? undefined,
        source: resolved.audit.source,
      },
      () =>
        next({
          context: {
            workspace,
            apiToken,
            apiCredentialId,
            ...(mobile && {
              user: mobile.user,
              member: mobile.member,
              mobileDeviceId: mobile.deviceId ?? undefined,
              requestIssuedAtMs,
            }),
          } satisfies Partial<BaseContext>,
        }),
    )
  },
)
