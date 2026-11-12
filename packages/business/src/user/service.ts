import {
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import {
  auditLogRepository,
  authAccountRepository,
  contactNoteRepository,
  conversationParticipantRepository,
  mobileRefreshTokenRepository,
  oauthAccessTokenRepository,
  oauthConsentRepository,
  oauthRefreshTokenRepository,
  sessionRepository,
  unassignUserBatch,
  userDeviceTokenRepository,
  userRepository,
  workspaceRepository,
} from "@chatbotx.io/database/repositories"
import { userModel } from "@chatbotx.io/database/schema"
import { setLocalStatementTimeout } from "@chatbotx.io/database/statement-timeout"
import type { UserModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { resourceDeletionLogService } from "../resource-deletion-log/service"
import { nextScheduledDeletionAt } from "../workspace/deletion-schedule"
import { workspaceService } from "../workspace/service"
import { workspaceMemberService } from "../workspace-member/service"

const accountDeletionTarget = (user: Pick<UserModel, "id">) => ({
  type: "user" as const,
  id: user.id,
})

const USER_PURGE_RETRY_DELAY_MS = 60 * 60 * 1000
const USER_REFERENCE_DRAIN_STATEMENT_TIMEOUT = "30s"

class UserService extends BaseService {
  /**
   * Clear the forced-password-change gate for a user. Called server-side ONLY
   * after better-auth has verified the current password and applied the change —
   * never expose a standalone "clear the flag" path to clients, or a provisioned
   * account could keep its temporary password.
   */
  async clearMustChangePassword(userId: string): Promise<void> {
    await db
      .update(userModel)
      .set({ mustChangePassword: false })
      .where(eq(userModel.id, userId))
  }

  async findById(userId: string): Promise<UserModel | undefined> {
    return await db.query.userModel.findFirst({ where: { id: userId } })
  }

  async findByIdOrFail(userId: string): Promise<UserModel> {
    const user = await this.findById(userId)
    if (!user) {
      throw notFoundException("User not found")
    }
    return user
  }

  async findNameAndEmail(
    userId: string,
  ): Promise<{ name: string | null; email: string | null } | undefined> {
    return await db.query.userModel.findFirst({
      where: { id: userId },
      columns: { name: true, email: true },
    })
  }

  async requestAccountDeletion(props: {
    actor: { userId: string }
    userId: string
  }): Promise<{ scheduledDeletionAt: Date }> {
    if (props.actor.userId !== props.userId) {
      throw new ChatbotXException(
        "Account deletion can only be requested for the current user",
        "forbidden",
        403,
      )
    }

    const result = await db.transaction(async (tx) => {
      const user = await userRepository.findForAccountDeletion(props.userId, tx)
      if (!user) {
        throw notFoundException("User not found")
      }

      if (user.deletionRequestedAt && user.scheduledDeletionAt) {
        return {
          removedMembers: [],
          scheduledDeletionAt: user.scheduledDeletionAt,
        }
      }

      const ownedTenant = await tx.query.tenantModel.findFirst({
        where: { ownerId: props.userId },
        columns: { id: true },
      })
      if (ownedTenant) {
        throw new ChatbotXException(
          "Reseller accounts must contact support to delete their account",
          "accountDeletionSupportRequired",
          403,
        )
      }

      const ownedWorkspaces = await workspaceRepository.listByOwner(
        { ownerId: props.userId },
        tx,
      )
      for (const workspace of ownedWorkspaces) {
        if (!workspace.scheduledDeletionAt) {
          await workspaceService.scheduleDeletion({
            actorId: props.actor.userId,
            id: workspace.id,
            tx,
          })
        }
      }

      const removedMembers =
        await workspaceMemberService.removeForAccountDeletion({
          tx,
          userId: props.userId,
        })

      const requestedAt = new Date()
      const scheduledDeletionAt = nextScheduledDeletionAt()
      await userRepository.markDeletionRequested(
        {
          userId: props.userId,
          requestedAt,
          scheduledDeletionAt,
        },
        tx,
      )
      await resourceDeletionLogService.recordRequest({
        resource: accountDeletionTarget(user),
        requestedByUserId: props.actor.userId,
        status: "pending",
        tx,
      })

      await sessionRepository.deleteByUserId(props.userId, tx)
      await mobileRefreshTokenRepository.revokeAllForUser(
        props.userId,
        requestedAt,
        tx,
      )
      await userDeviceTokenRepository.deleteByUserId(props.userId, tx)
      await oauthAccessTokenRepository.deleteByUserId(props.userId, tx)
      await oauthConsentRepository.deleteByUserId(props.userId, tx)
      await oauthRefreshTokenRepository.deleteByUserId(props.userId, tx)
      await authAccountRepository.clearTokensByUserId(props.userId, tx)

      return { removedMembers, scheduledDeletionAt }
    })

    await workspaceMemberService.finalizeAccountDeletionMembershipRemovals(
      result.removedMembers,
    )
    return { scheduledDeletionAt: result.scheduledDeletionAt }
  }

  async listDueDeletedUserIds(props?: {
    limit?: number
    now?: Date
  }): Promise<string[]> {
    return await userRepository.listDueForPurge({
      limit: props?.limit ?? 100,
      now: props?.now ?? new Date(),
    })
  }

  async drainUserReferences(userId: string): Promise<boolean> {
    const batchSize = 5000
    const deadlineAt = Date.now() + 90_000
    const drainers: Array<(tx: DatabaseClient) => Promise<number>> = [
      async (tx) => await unassignUserBatch(userId, batchSize, tx),
      async (tx) =>
        await auditLogRepository.detachUserBatch(userId, batchSize, tx),
      async (tx) =>
        await contactNoteRepository.detachAuthorBatch(userId, batchSize, tx),
      async (tx) =>
        await conversationParticipantRepository.deleteByUserBatch(
          userId,
          batchSize,
          tx,
        ),
    ]

    for (;;) {
      let drained = 0
      for (const drain of drainers) {
        if (Date.now() >= deadlineAt) {
          return false
        }
        drained += await db.transaction(async (tx) => {
          await setLocalStatementTimeout(
            tx,
            USER_REFERENCE_DRAIN_STATEMENT_TIMEOUT,
          )
          return await drain(tx)
        })
      }

      if (drained === 0) {
        return true
      }
    }
  }

  async purgeDeletedUser(
    userId: string,
  ): Promise<"deleted" | "pending" | "notDue"> {
    const now = new Date()
    const user = await this.findById(userId)
    if (
      !(user?.deletionRequestedAt && user.scheduledDeletionAt) ||
      user.scheduledDeletionAt > now
    ) {
      return "notDue"
    }

    const deletionRequestedAt = user.deletionRequestedAt

    try {
      const ownedWorkspaces = await workspaceRepository.listByOwner({
        ownerId: userId,
      })
      if (ownedWorkspaces.length > 0) {
        for (const workspace of ownedWorkspaces) {
          if (workspace.scheduledDeletionAt) {
            continue
          }
          logger.error(
            { userId, workspaceId: workspace.id },
            "account-deletion: rescheduling canceled owned workspace",
          )
          await workspaceService.scheduleDeletion({
            actorId: userId,
            id: workspace.id,
          })
        }
        await userRepository.postponePurge({
          userId,
          until: new Date(Date.now() + USER_PURGE_RETRY_DELAY_MS),
        })
        return "pending"
      }

      if (!(await this.drainUserReferences(userId))) {
        await userRepository.postponePurge({
          userId,
          until: new Date(Date.now() + USER_PURGE_RETRY_DELAY_MS),
        })
        return "pending"
      }

      return await db.transaction(async (tx) => {
        if (
          !(await userRepository.deleteIfDue({
            userId,
            now,
            tx,
          }))
        ) {
          return "notDue"
        }

        const pendingLogId = await resourceDeletionLogService.findPendingId({
          resource: accountDeletionTarget(user),
          tx,
        })
        if (pendingLogId) {
          await resourceDeletionLogService.completePending({
            id: pendingLogId,
            tx,
          })
        } else {
          await resourceDeletionLogService.recordHistoricalRequest({
            resource: accountDeletionTarget(user),
            requestedAt: deletionRequestedAt,
            requestedByUserId: userId,
            status: "completed",
            tx,
          })
        }
        return "deleted"
      })
    } catch (error) {
      try {
        await userRepository.postponePurge({
          userId,
          until: new Date(Date.now() + USER_PURGE_RETRY_DELAY_MS),
        })
      } catch (postponeError) {
        logger.error(
          { err: postponeError, userId },
          "account-deletion: failed to postpone user purge",
        )
      }
      throw error
    }
  }

  /**
   * Of the given ids, the ones that still have a `User` row. Used to drop ids
   * that outlived their user — a deleted `User` cascades its `UserQuota` row but
   * not the Redis live-counter key, so reconciling such a ghost id would violate
   * the `UserQuota → User` foreign key on every run.
   */
  async listExistingIds(input: { ids: string[] }): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }

    const rows = await db
      .select({ id: userModel.id })
      .from(userModel)
      .where(inArray(userModel.id, input.ids))

    return rows.map((row) => row.id)
  }
}

export const userService = new UserService()
