import {
  isPlatformAdmin,
  isSuperAdmin,
  isWorkspaceScheduledForDeletion,
} from "@chatbotx.io/business"
import { getAuditActor, withAuditContext } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { findOrFail, isDatabaseError } from "@chatbotx.io/database/client"
import { userModel } from "@chatbotx.io/database/schema"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { headers } from "next/headers"
import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"
import {
  checkWorkspaceOwnerAccess,
  workspaceAccessDenialException,
} from "@/lib/workspace/authorize-workspace-access"
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

  const requestHeaders = await headers()

  return withAuditContext(
    {
      userId: user.id,
      ipAddress: getGuestClientIp(requestHeaders),
      userAgent: requestHeaders.get("user-agent") ?? undefined,
    },
    () => next({ ctx: { user } }),
  )
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

    const { workspaceMembers, workspaces } = await getAllWorkspaceMembers(
      user.id,
    )
    const workspace = workspaces.find((c) => c.id === workspaceId)
    const member = workspaceMembers.find((m) => m.workspaceId === workspaceId)
    if (!(workspace && member)) {
      throw new Error("Workspace not found")
    }

    // `permissions` is exposed so actions can gate on it (e.g. superAdmin)
    // without a second user+member round-trip — the same rows are already
    // loaded here. The `permissions` jsonb defaults to `{}`, so callers must
    // fail closed on missing keys (see `hasWorkspacePermission`).
    return withAuditContext(
      { ...(getAuditActor() ?? {}), workspaceId: workspace.id },
      () =>
        next({
          ctx: {
            workspaceId: workspace.id,
            workspace,
            workspaceMemberPermissions: member.permissions,
          },
        }),
    )
  },
)

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
    // create/change action directly. Shared with oRPC's workspace-token
    // middleware via checkWorkspaceOwnerAccess (cloud-only; self-hosted stays
    // unrestricted).
    const denialReason = await checkWorkspaceOwnerAccess({
      ownerId: ctx.workspace.ownerId,
    })
    if (denialReason) {
      throw workspaceAccessDenialException(denialReason)
    }

    return next({ ctx })
  },
)

// Settings/general remains editable during the deletion grace window so admins
// can correct workspace metadata before undoing or before the purge deadline.
export const workspaceActionClientAllowScheduledDeletion =
  workspaceActionClientAllowExpired.use(async ({ ctx, next }) => {
    const denialReason = await checkWorkspaceOwnerAccess({
      ownerId: ctx.workspace.ownerId,
    })
    if (denialReason) {
      throw workspaceAccessDenialException(denialReason)
    }

    return next({ ctx })
  })
