import { macRepository } from "@chatbotx.io/analytics"
import { db } from "@chatbotx.io/database/client"
import {
  type WorkspaceMemberPermissions,
  workspaceMemberRoles,
} from "@chatbotx.io/database/partials"
import {
  workspaceMemberRepository,
  workspaceRepository,
} from "@chatbotx.io/database/repositories"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import {
  type AuditRecordDispatcherInput,
  dispatchAuditRecordSafely,
} from "../audit/dispatcher"
import { tenantService } from "../enterprise/tenant/service"
import {
  ChatbotXException,
  conflictException,
  notFoundException,
} from "../errors"
import { logger } from "../logger"
import { tryRevokeWorkspaceMemberRealtimeConnections } from "../platform/realtime-broadcast"
import { userQuotaService } from "../user-quota/service"
import { workingHoursService } from "../working-hours/service"
import {
  workspaceMemberCacheTag,
  workspaceMemberService,
  workspaceRosterCacheTag,
} from "../workspace-member/service"
import { workspaceUsageService } from "../workspace-usage/service"

const OWNER_PERMISSIONS: WorkspaceMemberPermissions = {
  superAdmin: true,
  analytics: true,
  flows: true,
  contacts: true,
  onlyAssignedContacts: true,
  emailAndPhone: true,
  broadcast: true,
  ecommerce: true,
}

const DEFAULT_NOTIFICATION_TYPES = {
  notifyAdmin: true,
  newMessageToHuman: true,
  newOrder: true,
}
const DEFAULT_NOTIFICATION_CHANNELS = {
  messenger: true,
  email: true,
  telegram: true,
  browser: true,
}

const forbiddenException = (message: string) =>
  new ChatbotXException(message, "forbidden", 403)

export type TransferSubAccountWorkspaceInput = {
  /** The signed-in reseller owner — the tenant is derived from them, never from input. */
  resellerUserId: string
  workspaceId: string
  actorUserId: string
}

export type TransferSubAccountWorkspaceResult = {
  previousOwnerId: string
  removedUserIds: string[]
}

type TransferWrite = TransferSubAccountWorkspaceResult & {
  workspaceName: string
}

/**
 * Moves a sub-account's workspace to the reseller owner's platform (root
 * tenant) workspaces. The reseller becomes the single owner; every member of a
 * non-root tenant (the old owner and their team) is removed.
 */
export async function transferSubAccountWorkspaceToOwner(
  input: TransferSubAccountWorkspaceInput,
): Promise<TransferSubAccountWorkspaceResult> {
  const { resellerUserId, workspaceId } = input

  const tenant = await tenantService.findByOwner(resellerUserId)
  if (tenant?.status !== "active") {
    throw forbiddenException("Only an active reseller can move workspaces")
  }

  const written = await db.transaction(async (tx): Promise<TransferWrite> => {
    const workspace = await workspaceRepository.lockForOwnerTransfer(
      { id: workspaceId },
      tx,
    )
    // Both "other tenant" and "not a sub-account's workspace" read as
    // not-found so a reseller cannot probe workspaces outside their tenant.
    if (
      !workspace ||
      workspace.tenantId !== tenant.id ||
      workspace.ownerTenantId !== tenant.id
    ) {
      throw notFoundException("Workspace not found")
    }
    if (workspace.purgeStartedAt || workspace.scheduledDeletionAt) {
      throw conflictException(
        "This workspace is being deleted and cannot be moved",
        "workspaceDeletionStarted",
      )
    }

    const previousOwnerId = workspace.ownerId
    // Same key as `lockFirstWorkspace`, taken in sorted order so two
    // concurrent transfers touching the same pair cannot deadlock.
    for (const ownerId of [previousOwnerId, resellerUserId].sort()) {
      await workspaceRepository.lockFirstWorkspace({ ownerId }, tx)
    }

    await workspaceRepository.reassignOwner(
      {
        id: workspaceId,
        ownerId: resellerUserId,
        tenantId: ROOT_TENANT_ID,
      },
      tx,
    )

    const writable = await workspaceRepository.lockWorkspaceForChildWrite(
      { workspaceId },
      tx,
    )
    if (!writable) {
      throw conflictException(
        "This workspace is being deleted and cannot be moved",
        "workspaceDeletionStarted",
      )
    }

    const removedUserIds = await workspaceMemberRepository.deleteNonRootMembers(
      workspaceId,
      tx,
    )
    if (removedUserIds.length > 0) {
      await workingHoursService.removeMembersForUsers({
        workspaceId,
        userIds: removedUserIds,
        tx,
      })
    }

    const existing = await workspaceMemberRepository.findByWorkspaceAndUser(
      { workspaceId, userId: resellerUserId },
      tx,
    )
    if (existing) {
      await workspaceMemberRepository.setRoleAndPermissions(
        {
          id: existing.id,
          role: workspaceMemberRoles.enum.owner,
          permissions: OWNER_PERMISSIONS,
        },
        tx,
      )
    } else {
      await workspaceMemberService.create({
        tx,
        data: {
          userId: resellerUserId,
          workspaceId,
          role: workspaceMemberRoles.enum.owner,
          permissions: OWNER_PERMISSIONS,
          notificationTypes: DEFAULT_NOTIFICATION_TYPES,
          notificationChannels: DEFAULT_NOTIFICATION_CHANNELS,
        },
      })
    }

    await macRepository.restampCurrentPeriodOwner(
      { workspaceId, ownerId: resellerUserId, tenantId: ROOT_TENANT_ID },
      tx,
    )

    return { previousOwnerId, removedUserIds, workspaceName: workspace.name }
  })

  await runAfterCommit({ ...input, tenantId: tenant.id }, written)

  return {
    previousOwnerId: written.previousOwnerId,
    removedUserIds: written.removedUserIds,
  }
}

/** Cache busts, quota reconcile, realtime revoke and audit. Never throws: the move already committed. */
async function runAfterCommit(
  input: TransferSubAccountWorkspaceInput & { tenantId: string },
  written: TransferWrite,
): Promise<void> {
  const { resellerUserId, workspaceId, actorUserId, tenantId } = input
  const { previousOwnerId, removedUserIds } = written
  const affectedUserIds = [
    ...new Set([previousOwnerId, resellerUserId, ...removedUserIds]),
  ]

  const steps: [string, () => Promise<unknown>][] = [
    [
      "cache invalidation",
      () =>
        invalidateCacheByTags([
          `workspaces:${workspaceId}`,
          workspaceRosterCacheTag(workspaceId),
          `workspaces:${workspaceId}:owner-user-id`,
          ...affectedUserIds.map(workspaceMemberCacheTag),
        ]),
    ],
    [
      "team member usage release",
      async () => {
        for (const _userId of removedUserIds) {
          await workspaceUsageService.decrement(workspaceId, "teamMembers")
        }
      },
    ],
    [
      "realtime revoke",
      async () => {
        for (const userId of removedUserIds) {
          await tryRevokeWorkspaceMemberRealtimeConnections({
            workspaceId,
            userId,
            reason: "deleted",
            errorMessage:
              "Failed to revoke realtime connections after workspace transfer",
          })
        }
      },
    ],
    [
      "quota reconcile",
      async () => {
        await userQuotaService.reconcileUserSelfUsage(previousOwnerId)
        await userQuotaService.reconcileUserSelfUsage(resellerUserId)
        await userQuotaService.reconcileOwnerPoolUsage(resellerUserId, tenantId)
      },
    ],
    [
      "audit",
      () =>
        dispatchAuditRecordSafely(
          {
            action: "transfer_workspace_to_owner",
            detail: `transferred workspace "${written.workspaceName}" (#${workspaceId}) from sub-account ${previousOwnerId} to owner ${resellerUserId}`,
            userId: actorUserId,
            workspaceId,
          } satisfies AuditRecordDispatcherInput,
          "Failed to audit workspace transfer",
        ),
    ],
  ]

  for (const [label, run] of steps) {
    try {
      await run()
    } catch (err) {
      logger.error(
        { err, workspaceId, resellerUserId },
        `Workspace transfer: ${label} failed after commit`,
      )
    }
  }
}
