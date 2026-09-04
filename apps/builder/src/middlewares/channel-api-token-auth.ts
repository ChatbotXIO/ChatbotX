import {
  inboxService,
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { hashToken } from "@chatbotx.io/business/workspace-api-token/credentials"
import { ORPCError } from "@orpc/server"
import { findIntegrationApiByTokenHash } from "@/features/integration-api/queries/find-by-token-hash"
import { base } from "./context"

/**
 * Authenticates a single API-channel inbox, not a workspace. Bearer header
 * only — no `?token=` query fallback (query params leak into logs, proxies,
 * and Referer headers; a new surface should not repeat that compat shim).
 */
export const channelApiTokenAuthMidddleware = base.middleware(
  async ({ context, next }) => {
    const authHeader = context.headers.get("Authorization")
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null
    if (!token) {
      throw new ORPCError("UNAUTHORIZED")
    }

    const integrationApi = await findIntegrationApiByTokenHash({
      tokenHash: await hashToken(token),
    })
    if (!integrationApi?.enabled) {
      throw new ORPCError("UNAUTHORIZED")
    }

    const workspace = await workspaceService.findById({
      id: integrationApi.workspaceId,
    })
    if (isWorkspaceScheduledForDeletion(workspace)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace deletion scheduled",
      })
    }

    const inbox = await inboxService.find({
      where: { id: integrationApi.inboxId },
    })
    if (!inbox) {
      throw new ORPCError("UNAUTHORIZED", { message: "Inbox not found" })
    }

    return await next({
      context: {
        integrationApi,
        inbox,
        workspace,
      },
    })
  },
)
