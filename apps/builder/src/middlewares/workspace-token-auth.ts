import {
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { ORPCError } from "@orpc/server"
import { hashToken } from "@/features/integration-api/lib/token-hash"
import { logger } from "@/lib/log"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"
import {
  checkWorkspaceOwnerAccess,
  isWorkspaceMutationMethod,
  workspaceAccessDenialOrpcError,
} from "@/lib/workspace/authorize-workspace-access"
import { base } from "./context"

const assertNotRateLimited = (workspaceId: string): Promise<void> =>
  assertApiNotRateLimited({
    scope: "workspace-token-rate-limit",
    key: workspaceId,
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

    // Primary lookup is by hash. The plaintext fallback only exists for rows
    // created between deploying this code and running the tokenHash migration
    // (which backfills every existing token) — remove it, together with the
    // `token` column, once the warn line below has been silent for a release.
    const tokenHash = await hashToken(token)
    const workspace =
      (await workspaceService.find({ where: { tokenHash } })) ??
      (await workspaceService.find({ where: { token } }))
    if (!workspace) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }

    if (!workspace.tokenHash) {
      logger.warn(
        { workspaceId: workspace.id },
        "Workspace authenticated via legacy plaintext token",
      )
    }

    await assertNotRateLimited(workspace.id)

    if (isWorkspaceScheduledForDeletion(workspace)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace deletion scheduled",
      })
    }

    // Owner-quota/trial gate — mirrors workspaceActionClient in safe-action.ts.
    // Mutations only: an expired workspace must stay readable via the public
    // API just like it stays readable in the builder (invariant #14).
    if (isWorkspaceMutationMethod(procedure["~orpc"].route.method)) {
      const denialReason = await checkWorkspaceOwnerAccess({
        ownerId: workspace.ownerId,
      })
      if (denialReason) {
        throw workspaceAccessDenialOrpcError(denialReason)
      }
    }

    return await next({
      context: {
        workspace,
      },
    })
  },
)
