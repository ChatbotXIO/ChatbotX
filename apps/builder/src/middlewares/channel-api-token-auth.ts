import { createHash } from "node:crypto"
import {
  isWorkspaceScheduledForDeletion,
  workspaceService,
} from "@chatbotx.io/business"
import { findOrFail } from "@chatbotx.io/database/client"
import { inboxModel } from "@chatbotx.io/database/schema"
import { ORPCError } from "@orpc/server"
import { findIntegrationApiByTokenHash } from "@/features/integration-api/queries/find-by-token-hash"
import { base } from "./context"

const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex")

/**
 * Authenticates a single API-channel inbox, not a workspace. Bearer header
 * only — no `?token=` query fallback (query params leak into logs, proxies,
 * and Referer headers; a new surface should not repeat that compat shim).
 */
export const channelApiTokenAuthMidddleware = base.middleware(
  async ({ context, next }) => {
    const authHeader = context.headers.get("Authorization")
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null
    if (!token) {
      throw new ORPCError("UNAUTHORIZED")
    }

    const integrationApi = await findIntegrationApiByTokenHash({
      tokenHash: hashToken(token),
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

    const inbox = await findOrFail({
      table: inboxModel,
      where: { id: integrationApi.inboxId },
      message: "Inbox not found",
    })

    return await next({
      context: {
        integrationApi,
        inbox,
        workspace,
      },
    })
  },
)
