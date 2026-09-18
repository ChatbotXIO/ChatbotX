import {
  isPlatformAdmin,
  isSuperAdmin,
  isWorkspaceScheduledForDeletion,
  resolveWorkspaceAccess,
} from "@chatbotx.io/business"
import { getAuditActor, withAuditContext } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { findOrFail, isDatabaseError } from "@chatbotx.io/database/client"
import { userModel } from "@chatbotx.io/database/schema"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import {
  createMiddleware,
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import {
  hasContactsAccess,
  hasWorkspacePermission,
  type PermissionsInput,
} from "@/lib/auth/permission-routes"
import { getCurrentUserId } from "@/lib/auth/utils"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"
import {
  checkWorkspaceOwnerAccess,
  workspaceAccessDenialException,
} from "@/lib/workspace/authorize-workspace-access"
import { logger } from "./log"

const SERVER_ERROR_STATUS_THRESHOLD = 500

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof ChatbotXException || error instanceof SdkException) {
      // Expected client-facing 4xx (e.g. notFoundException, validationException)
      // — warn rather than error so alerting stays quiet, but still keep the
      // signal in the logs. A 5xx ChatbotXException still gets logged at error
      // level below since findOrFail/generic throws land there too. Mirrors
      // `mapKnownOrpcErrors` in orpc.ts, which applies the same split to the
      // oRPC surface.
      if (error.httpStatusCode < SERVER_ERROR_STATUS_THRESHOLD) {
        logger.warn({ err: error }, "Action rejected request")
      } else {
        logger.error({ err: error }, "Action rejected request")
      }
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

    const { workspaceMembers } = await getAllWorkspaceMembers(user.id)
    const realMember = workspaceMembers.find(
      (m) => m.workspaceId === workspaceId,
    )

    const access = await resolveWorkspaceAccess({
      realMember,
      workspaceId,
      user,
    })
    if (!access) {
      throw new Error("Workspace not found")
    }
    const { workspace, member, isSupportSession } = access

    // permissions is exposed so actions can gate on it (e.g. superAdmin)
    // without a second user+member round-trip — the same rows are already
    // loaded here. The permissions jsonb defaults to {}, so callers must fail
    // closed on missing keys.
    // The caller's user id is not re-exposed as a separate ctx.userId —
    // ctx.user.id is already the one place every action reads it, including the
    // call-artifact actions, which pass { userId: ctx.user.id, permissions:
    // ctx.workspaceMemberPermissions } as the already-resolved member to
    // canReadCall.
    return withAuditContext(
      { ...(getAuditActor() ?? {}), workspaceId: workspace.id },
      () =>
        next({
          ctx: {
            workspaceId: workspace.id,
            workspace,
            workspaceMemberPermissions: member.permissions,
            isSupportSession,
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
    // unrestricted). A workspace's owner quota row is the tenant pool
    // (AGENTS.md invariant #12), so members must never be gated by their
    // unrelated personal quota.
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

/**
 * Blocks call control (ringing, answering, dialing, permission requests, calling
 * config) during a platform-support session, since its synthetic membership
 * otherwise carries full read/write access; reading call history is unaffected.
 */
export const rejectSupportSession = createMiddleware<{
  ctx: { isSupportSession: boolean }
}>().define(async ({ ctx, next }) => {
  if (ctx.isSupportSession) {
    const t = await getTranslations()
    throw new ChatbotXException(
      t("whatsapp.calls.errors.supportSessionCallingBlocked"),
      "supportSessionCallingBlocked",
      403,
    )
  }
  return await next({ ctx })
})

/**
 * Refuses a member with neither contacts nor onlyAssignedContacts from any
 * calling action that starts or joins a call. Reuses hasContactsAccess, which
 * already lets superAdmin through, rather than a parallel permission check.
 */
export const requireContactsAccess = createMiddleware<{
  ctx: { workspaceMemberPermissions: PermissionsInput }
}>().define(async ({ ctx, next }) => {
  if (!hasContactsAccess(ctx.workspaceMemberPermissions)) {
    const t = await getTranslations()
    throw new ChatbotXException(
      t("whatsapp.calls.errors.callingAccessDenied"),
      "callingAccessDenied",
      403,
    )
  }
  return await next({ ctx })
})

/**
 * Every calling action that starts or joins a call (initiate/mode/permission-
 * request/answer/resume/TURN). Not used by hangup-voip-call/heartbeat-active-
 * voip-call (unchanged workspaceActionClient — ending or keeping alive a call a
 * workspace freeze already interrupted must keep working) nor by the read-only
 * call-artifact actions (unaffected).
 */
export const callingActionClient = workspaceActionClient
  .use(rejectSupportSession)
  .use(requireContactsAccess)

/**
 * Calling configuration actions (settings, call hours, subscription fix) —
 * support-session-gated like every other calling action, but not contacts-
 * gated: each keeps its own assertWorkspaceSuperAdmin call, and a synthetic
 * support membership carries superAdmin: true so it would pass
 * requireContactsAccess anyway — the extra layer would be redundant.
 */
export const callingAdminActionClient =
  workspaceActionClient.use(rejectSupportSession)

/**
 * The Calls page's own page-level gate: hasContactsAccess || analytics.
 * Distinct from requireContactsAccess (contacts/onlyAssignedContacts only)
 * because an analytics-only member has no calling access at all but must still
 * read the workspace's call history/artifacts. A read action, unaffected by the
 * support-session gate.
 */
export const requireCallHistoryAccess = createMiddleware<{
  ctx: { workspaceMemberPermissions: PermissionsInput }
}>().define(async ({ ctx, next }) => {
  if (
    !(
      hasContactsAccess(ctx.workspaceMemberPermissions) ||
      hasWorkspacePermission(ctx.workspaceMemberPermissions, "analytics")
    )
  ) {
    const t = await getTranslations()
    throw new ChatbotXException(
      t("whatsapp.calls.errors.callHistoryAccessDenied"),
      "callHistoryAccessDenied",
      403,
    )
  }
  return await next({ ctx })
})

export const callHistoryActionClient = workspaceActionClientAllowExpired.use(
  requireCallHistoryAccess,
)
