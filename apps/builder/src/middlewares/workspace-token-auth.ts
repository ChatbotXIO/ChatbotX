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
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"
import {
  assertWorkspaceOwnerAccessForMethod,
  isReadOnlyTokenAllowedMethod,
} from "@/lib/workspace/authorize-workspace-access"
import { base, type RequestApiToken } from "./context"

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

const assertPreAuthNotRateLimited = (
  headers: Headers,
  resHeaders?: Headers,
): Promise<void> =>
  assertApiNotRateLimited({
    scope: "workspace-token-preauth-rate-limit",
    key: getGuestClientIp(headers),
    limit: PREAUTH_REQUEST_LIMIT,
    resHeaders,
  })

const invalidTokenError = () =>
  new ORPCError("INVALID_CHATBOT_TOKEN", {
    status: 401,
    message: "Invalid or missing workspace API token",
  })

export const workspaceTokenAuthMidddleware = base.middleware(
  async ({ context, next, procedure }) => {
    const authHeader = context.headers.get("Authorization")
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null
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

    const tokenHash = await hashToken(token)
    let auth:
      | { workspace: WorkspaceModel; apiToken: WorkspaceApiTokenModel }
      | undefined
    try {
      auth = await workspaceApiTokenService.findWorkspaceByTokenHash({
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

    let resolved: {
      workspace: WorkspaceModel
      apiToken: RequestApiToken
      audit: { userId: string; source: string }
    }

    if (auth) {
      resolved = {
        workspace: auth.workspace,
        apiToken: {
          id: auth.apiToken.id,
          workspaceId: auth.apiToken.workspaceId,
          permission: auth.apiToken.permission,
          scopes: auth.apiToken.scopes,
          isDefault: auth.apiToken.isDefault,
        },
        // API-token calls are attributed to the workspace owner because an
        // opaque token has no individual user identity to audit.
        audit: {
          userId: auth.workspace.ownerId,
          source: `api-token:${auth.apiToken.id}`,
        },
      }
    } else {
      if (!bearerToken) {
        throw invalidTokenError()
      }

      // OAuth calls retain the real user identity and OAuth client source.
      const oauth = await mcpOAuthService.resolvePrincipal({
        accessToken: bearerToken,
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
          message: `This account has access to ${oauth.workspaces.length} workspaces. Select one by adding ?workspace_id=<id> to the MCP server URL (or sending the x-workspace-id header). Available: ${workspaces}`,
        })
      }

      resolved = {
        workspace: oauth.principal.workspace,
        apiToken: {
          id: `oauth:${oauth.principal.accessTokenId}`,
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

    await assertNotRateLimited(workspace.id, context.resHeaders)

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
            apiCredentialId: `api-token:${apiToken.id}`,
          },
        }),
    )
  },
)
