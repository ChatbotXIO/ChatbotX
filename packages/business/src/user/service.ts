import {
  and,
  db,
  eq,
  inArray,
  lte,
  notExists,
} from "@chatbotx.io/database/client"
import {
  accountModel,
  mobileRefreshTokenModel,
  oauthAccessTokenModel,
  oauthConsentModel,
  oauthRefreshTokenModel,
  sessionModel,
  userDeviceTokenModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { resourceDeletionLogService } from "../resource-deletion-log/service"
import { nextScheduledDeletionAt } from "../workspace/deletion-schedule"
import { workspaceService } from "../workspace/service"
import { workspaceMemberService } from "../workspace-member/service"

const accountDeletionTarget = (user: Pick<UserModel, "id">) => ({
  type: "user" as const,
  id: user.id,
})

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
      const [user] = await tx
        .select()
        .from(userModel)
        .where(eq(userModel.id, props.userId))
        .for("update")
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

      const ownedWorkspaces = await tx
        .select({
          id: workspaceModel.id,
          scheduledDeletionAt: workspaceModel.scheduledDeletionAt,
        })
        .from(workspaceModel)
        .where(eq(workspaceModel.ownerId, props.userId))

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

      const scheduledDeletionAt = nextScheduledDeletionAt()
      await tx
        .update(userModel)
        .set({ deletionRequestedAt: new Date(), scheduledDeletionAt })
        .where(eq(userModel.id, props.userId))

      await resourceDeletionLogService.recordRequest({
        resource: accountDeletionTarget(user),
        requestedByUserId: props.actor.userId,
        status: "pending",
        tx,
      })

      await Promise.all([
        tx.delete(sessionModel).where(eq(sessionModel.userId, props.userId)),
        tx
          .delete(mobileRefreshTokenModel)
          .where(eq(mobileRefreshTokenModel.userId, props.userId)),
        tx
          .delete(userDeviceTokenModel)
          .where(eq(userDeviceTokenModel.userId, props.userId)),
        tx
          .delete(oauthAccessTokenModel)
          .where(eq(oauthAccessTokenModel.userId, props.userId)),
        tx
          .delete(oauthConsentModel)
          .where(eq(oauthConsentModel.userId, props.userId)),
        tx
          .delete(oauthRefreshTokenModel)
          .where(eq(oauthRefreshTokenModel.userId, props.userId)),
        tx
          .update(accountModel)
          .set({ accessToken: null, idToken: null, refreshToken: null })
          .where(eq(accountModel.userId, props.userId)),
      ])

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
    const rows = await db
      .select({ id: userModel.id })
      .from(userModel)
      .where(
        and(
          lte(userModel.scheduledDeletionAt, props?.now ?? new Date()),
          notExists(
            db
              .select({ id: workspaceModel.id })
              .from(workspaceModel)
              .where(eq(workspaceModel.ownerId, userModel.id)),
          ),
        ),
      )
      .orderBy(userModel.scheduledDeletionAt, userModel.id)
      .limit(props?.limit ?? 100)
    return rows.map((row) => row.id)
  }

  async purgeDeletedUser(userId: string): Promise<boolean> {
    const user = await this.findById(userId)
    if (!(user?.deletionRequestedAt && user.scheduledDeletionAt)) {
      return false
    }

    const pendingLogId = await resourceDeletionLogService.findPendingId({
      resource: accountDeletionTarget(user),
    })
    return await db.transaction(async (tx) => {
      const ownedWorkspace = await tx.query.workspaceModel.findFirst({
        where: { ownerId: userId },
        columns: { id: true },
      })
      if (ownedWorkspace) {
        return false
      }

      const deleted = await tx
        .delete(userModel)
        .where(
          and(
            eq(userModel.id, userId),
            lte(userModel.scheduledDeletionAt, new Date()),
          ),
        )
        .returning({ id: userModel.id })
      if (deleted.length === 0) {
        return false
      }

      if (pendingLogId) {
        await resourceDeletionLogService.completePending({
          id: pendingLogId,
          tx,
        })
      } else {
        await resourceDeletionLogService.recordHistoricalRequest({
          resource: accountDeletionTarget(user),
          requestedAt: user.deletionRequestedAt ?? new Date(),
          requestedByUserId: userId,
          status: "completed",
          tx,
        })
      }

      return true
    })
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
