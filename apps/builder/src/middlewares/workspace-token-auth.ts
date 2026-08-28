import {
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { ORPCError } from "@orpc/server"
import { hashToken } from "@/features/integration-api/lib/token-hash"
import { logger } from "@/lib/log"
import { checkWorkspaceOwnerAccess } from "@/lib/workspace/authorize-workspace-access"
import { base } from "./context"

function orpcErrorForWorkspaceAccessDenial(
  reason: NonNullable<Awaited<ReturnType<typeof checkWorkspaceOwnerAccess>>>,
) {
  return reason === "macLimitReached"
    ? new ORPCError("macLimitReached", {
        message: "Monthly active contact limit reached",
        status: 403,
      })
    : new ORPCError("trialExpired", { message: "Trial expired", status: 403 })
}

export const workspaceTokenAuthMidddleware = base.middleware(
  async ({ context, next }) => {
    const authHeader = context.headers.get("Authorization")
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null
    const apiKeyToken = context.url
      ? new URL(context.url).searchParams.get("token")
      : null
    const token = bearerToken ?? apiKeyToken
    if (!token) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }

    // Hash lookup is the primary path for tokens issued after the tokenHash
    // migration. Plaintext fallback covers tokens issued before it — remove
    // once the "authenticated via legacy plaintext token" log line has been
    // silent for a full rotation window.
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

    if (isWorkspaceScheduledForDeletion(workspace)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace deletion scheduled",
      })
    }

    // Owner-quota/trial gate — mirrors workspaceActionClient in safe-action.ts.
    // Applied to every request (not just mutations): oRPC's `.route({ method })`
    // is declared per-procedure, after this shared middleware runs, so the HTTP
    // method isn't available here to gate mutations only.
    const denialReason = await checkWorkspaceOwnerAccess({
      ownerId: workspace.ownerId,
    })
    if (denialReason) {
      throw orpcErrorForWorkspaceAccessDenial(denialReason)
    }

    // Adds session and user to the context
    return await next({
      context: {
        workspace,
      },
    })
  },
)
