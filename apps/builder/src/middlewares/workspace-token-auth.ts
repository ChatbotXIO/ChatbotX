import {
  isWorkspaceScheduledForDeletion,
  workspaceApiTokenService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { hashToken } from "@chatbotx.io/business/workspace-api-token/credentials"
import { ORPCError } from "@orpc/server"
import { logger } from "@/lib/log"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"
import {
  checkWorkspaceOwnerAccess,
  isReadOnlyTokenAllowedMethod,
  isWorkspaceMutationMethod,
  workspaceAccessDenialOrpcError,
} from "@/lib/workspace/authorize-workspace-access"
import { base, type RequestApiToken } from "./context"

const assertNotRateLimited = (workspaceId: string): Promise<void> =>
  assertApiNotRateLimited({
    scope: "workspace-token-rate-limit",
    key: workspaceId,
  })

// Generous ceiling: this bucket aggregates every workspace behind one egress
// IP, so it must sit well above the per-workspace limit — it only exists to
// stop unauthenticated token-guessing floods, which the per-workspace
// limiter below can never see (an invalid token resolves to no workspace).
const PREAUTH_REQUEST_LIMIT = 600

const assertPreAuthNotRateLimited = (headers: Headers): Promise<void> =>
  assertApiNotRateLimited({
    scope: "workspace-token-preauth-rate-limit",
    key: getGuestClientIp(headers),
    limit: PREAUTH_REQUEST_LIMIT,
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
    if (!token) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }
    if (!bearerToken && apiKeyToken) {
      logger.warn(
        { path: url?.pathname },
        "Workspace token authenticated via deprecated ?token= query param",
      )
    }

    // Best-effort IP-keyed gate BEFORE the lookup: requests with invalid
    // tokens never reach the per-workspace limiter below, so without this a
    // token-guessing flood gets unthrottled hash + DB lookups.
    await assertPreAuthNotRateLimited(context.headers)

    // Hash-only lookup: WorkspaceApiToken.tokenHash is authoritative for
    // auth. The deprecated Workspace.token column (kept read-only for
    // {{api_key}}) is never consulted here.
    const tokenHash = await hashToken(token)
    let auth: Awaited<
      ReturnType<typeof workspaceApiTokenService.findWorkspaceByTokenHash>
    >
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
        throw new ORPCError("INVALID_CHATBOT_TOKEN")
      }
      throw error
    }
    if (!auth) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }
    const { workspace, apiToken } = auth

    await assertNotRateLimited(workspace.id)

    if (isWorkspaceScheduledForDeletion(workspace)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace deletion scheduled",
      })
    }

    const method = procedure["~orpc"].route.method
    const isMutation = isWorkspaceMutationMethod(method)

    // Read-only tokens may only GET/HEAD — unlike isWorkspaceMutationMethod
    // above, DELETE is not exempt here: a read_only token must not be able to
    // delete data. Checked before the owner-quota gate below — no DB call
    // needed to enforce this.
    if (
      apiToken.permission === "read_only" &&
      !isReadOnlyTokenAllowedMethod(method)
    ) {
      throw new ORPCError("FORBIDDEN", {
        message: "Read-only token cannot perform this operation",
      })
    }

    // Owner-quota/trial gate — mirrors workspaceActionClient in safe-action.ts.
    // Mutations only: an expired workspace must stay readable via the public
    // API just like it stays readable in the builder (invariant #14).
    if (isMutation) {
      const denialReason = await checkWorkspaceOwnerAccess({
        ownerId: workspace.ownerId,
      })
      if (denialReason) {
        throw workspaceAccessDenialOrpcError(denialReason)
      }
    }

    const requestApiToken: RequestApiToken = {
      id: apiToken.id,
      workspaceId: apiToken.workspaceId,
      permission: apiToken.permission,
      scopes: apiToken.scopes,
      isDefault: apiToken.isDefault,
    }

    return await next({
      context: {
        workspace,
        apiToken: requestApiToken,
      },
    })
  },
)
