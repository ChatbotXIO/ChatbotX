import {
  isPlatformAdmin,
  isSuperAdmin,
  isWorkspaceScheduledForDeletion,
  quotaEnforcementService,
  userQuotaService,
} from "@chatbotx.io/business"
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

  // Forced-password-change gate — the single chokepoint for EVERY authenticated
  // server action (workspace and platform-admin clients both build on this one).
  // The RSC layouts redirect a flagged user to /auth/change-password, but a
  // stale session could still POST an action directly. `findOrFail` reads the
  // row fresh from the DB, so this never trusts a cookie-cached flag. The
  // force-change action itself deliberately runs on the lower-level
  // `actionClient` so it stays callable while the flag is set.
  if (user.mustChangePassword) {
    throw new ChatbotXException(
      "Password change required",
      "mustChangePassword",
      403,
    )
  }

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

export const superAdminActionClient = authActionClient.use(({ ctx, next }) => {
  if (!isSuperAdmin(ctx.user)) {
    throw new Error("Unauthorized")
  }
  return next({ ctx })
})

export const workspaceActionClientAllowExpired = authActionClient.use(
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

    return next({ ctx: { workspaceId: workspace.id, workspace } })
  },
)

async function getWorkspaceOwnerAccessState(ownerId: string) {
  const accessState = await userQuotaService.getAccessState(ownerId)
  if (accessState.blocked) {
    return accessState
  }

  // getAccessState already checks ownerId's own live MAC counter, so this is a
  // no-op for a reseller acting directly or a root-tenant owner (isAtLimit
  // reduces to the same isLimitReached(ownerId, "mac") call in both cases). It
  // only adds new information when ownerId is a sub-account: isAtLimit then
  // also checks the reseller pool row, closing a pool-level MAC bypass for
  // workspaces owned by a sub-account. Costs one extra, uncached lookup of the
  // owner's tenant on every call — see resolveContext in quota-enforcement/service.ts.
  if (
    await quotaEnforcementService.isAtLimit({
      userId: ownerId,
      metric: "mac",
    })
  ) {
    return { ...accessState, blocked: true, reason: "mac" as const }
  }

  return accessState
}

export const workspaceActionClient = workspaceActionClientAllowExpired.use(
  async ({ ctx, next }) => {
    // Server-side deletion gate: a workspace pending deletion must block every
    // mutation regardless of trial status, so this runs before the trial check
    // below. Mirrors the RSC-side redirect in enforceWorkspaceNotScheduledForDeletion.
    if (isWorkspaceScheduledForDeletion(ctx.workspace)) {
      throw new ChatbotXException(
        "Workspace deletion scheduled",
        "workspaceScheduledDeletion",
        403,
      )
    }

    // Server-side owner-quota gate: the RSC banner shows the workspace owner's
    // blocked read/delete mode, but a stale session could still POST a
    // create/change action directly. A workspace's owner quota row is the
    // tenant pool (AGENTS.md invariant #12), so members must never be gated by
    // their unrelated personal quota. Cloud-only; self-hosted editions have no
    // quota row and stay unrestricted. getAccessState's quota read is cached,
    // but getWorkspaceOwnerAccessState's tenant lookup (for the sub-account
    // pool check) is not — this adds one uncached DB round-trip per action.
    if (isCloud()) {
      const { blocked, reason } = await getWorkspaceOwnerAccessState(
        ctx.workspace.ownerId,
      )
      if (blocked) {
        throw reason === "mac"
          ? new ChatbotXException(
              "Monthly active contact limit reached",
              "macLimitReached",
              403,
            )
          : new ChatbotXException("Trial expired", "trialExpired", 403)
      }
    }

    return next({ ctx })
  },
)

// Settings/general remains editable during the deletion grace window so admins
// can correct workspace metadata before undoing or before the purge deadline.
export const workspaceActionClientAllowScheduledDeletion =
  workspaceActionClientAllowExpired.use(async ({ ctx, next }) => {
    if (isCloud()) {
      const { blocked, reason } = await getWorkspaceOwnerAccessState(
        ctx.workspace.ownerId,
      )
      if (blocked) {
        throw reason === "mac"
          ? new ChatbotXException(
              "Monthly active contact limit reached",
              "macLimitReached",
              403,
            )
          : new ChatbotXException("Trial expired", "trialExpired", 403)
      }
    }

    return next({ ctx })
  })
