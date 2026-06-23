import { isPlatformAdmin, userQuotaService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { findOrFail, isDatabaseError } from "@chatbotx.io/database/client"
import { userModel } from "@chatbotx.io/database/schema"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action"
import { isCloud } from "@/env"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { logger } from "./log"

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof ChatbotXException || error instanceof SdkException) {
      return error.message
    }

    if (isDatabaseError(error)) {
      logger.error({ err: error }, "Database error in actionClient")
      return DEFAULT_SERVER_ERROR_MESSAGE
    }

    logger.error({ err: error }, "Error in actionClient")
    return DEFAULT_SERVER_ERROR_MESSAGE
  },
})

export const authActionClient = actionClient.use(async ({ next }) => {
  const id = await getCurrentUserId()

  const user = await findOrFail({
    table: userModel,
    where: {
      id,
    },
  })

  return next({ ctx: { user } })
})

export const platformAdminActionClient = authActionClient.use(
  async ({ ctx, next }) => {
    if (!(await isPlatformAdmin(ctx.user))) {
      throw new Error("Unauthorized")
    }
    return next({ ctx })
  },
)

export const workspaceActionClient = authActionClient.use(
  async ({ bindArgsClientInputs, ctx, next }) => {
    const { user } = ctx

    const { data: workspaceId } = zodBigintAsString().safeParse(
      bindArgsClientInputs[0],
    )
    if (!workspaceId) {
      throw new Error("Workspace not found")
    }

    const { workspaces } = await getAllWorkspaceMembers(user.id)
    const workspace = workspaces.find((c) => c.id === workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    // Server-side trial gate: the RSC layout redirects a blocked user to
    // /trial-expired, but a stale session could still POST a server action
    // directly. Re-check the entitlement here so the paywall holds. Cloud-only;
    // self-hosted editions have no quota row and stay unrestricted. The quota
    // read is cached, so this adds no per-action DB round-trip in the hot path.
    if (isCloud()) {
      const { blocked } = await userQuotaService.getAccessState(user.id)
      if (blocked) {
        throw new ChatbotXException("Trial expired", "trialExpired", 403)
      }
    }

    return next({ ctx: { workspaceId: workspace.id, workspace } })
  },
)
