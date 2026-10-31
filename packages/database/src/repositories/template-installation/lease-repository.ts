import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  gt,
  lt,
  or,
  sql,
} from "../../client"
import { templateInstallationModel } from "../../schema"
import type { TemplateInstallationModel } from "../../types"
import { ownedByClaim, unfinishedInstallation } from "./shared"
import type { StaleTemplateInstallationRow } from "./types"

/** The install lease: claim, release, finish, and the sweep that finds abandoned rows. */
export const templateInstallationLeaseRepository = {
  /**
   * Takes ownership of an installation in one statement: a `pending` row, or
   * an `installing` row whose lease expired. Whoever gets the row back owns
   * it; every other call (a redelivery, a second worker) returns `null`.
   */
  async claim(
    input: {
      id: string
      workspaceId: string
      claimToken: string
      leaseExpiredBefore: Date
    },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel | null> {
    const [row] = await tx
      .update(templateInstallationModel)
      .set({
        status: "installing",
        claimToken: input.claimToken,
        claimedAt: new Date(),
        attempts: sql`${templateInstallationModel.attempts} + 1`,
      })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          eq(templateInstallationModel.workspaceId, input.workspaceId),
          or(
            eq(templateInstallationModel.status, "pending"),
            and(
              eq(templateInstallationModel.status, "installing"),
              lt(templateInstallationModel.claimedAt, input.leaseExpiredBefore),
            ),
          ),
        ),
      )
      .returning()
    return row ?? null
  },

  /** Gives the installation back (`installing` → `pending`) before a retryable failure. */
  async release(
    input: { id: string; claimToken: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({ status: "pending", claimToken: null, claimedAt: null })
      .where(ownedByClaim(input))
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /** Terminal success, written inside the apply transaction and fenced by the lease. */
  async complete(
    input: {
      id: string
      claimToken: string
      completion: Pick<
        typeof templateInstallationModel.$inferInsert,
        | "status"
        | "warnings"
        | "warningCount"
        | "resourceCount"
        | "installFolderId"
        | "pendingPublishEffects"
      >
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        ...input.completion,
        claimToken: null,
        errorCode: null,
        errorMessage: null,
        completedAt: new Date(),
        successfulInstallEvents: 1,
      })
      .where(ownedByClaim(input))
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /** Terminal failure by the lease owner, written outside the rolled-back apply transaction. */
  async fail(
    input: {
      id: string
      claimToken: string
      errorCode: string
      errorMessage: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        status: "failed",
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        claimToken: null,
        completedAt: new Date(),
      })
      .where(ownedByClaim(input))
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /**
   * Fails a row nobody owns (the enqueue itself threw, or the owner is
   * blocked), so it never stays `pending` for the sweep to re-find.
   */
  async failUnclaimed(
    input: { id: string; errorCode: string; errorMessage: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        status: "failed",
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        claimToken: null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          or(
            eq(templateInstallationModel.status, "pending"),
            eq(templateInstallationModel.status, "installing"),
          ),
        ),
      )
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /**
   * Installations the worker never finished and that are still worth
   * retrying: younger than `createdAfter`, so one that can never succeed is
   * not re-enqueued forever.
   */
  async listStale(
    input: {
      pendingBefore: Date
      leaseExpiredBefore: Date
      createdAfter: Date
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<StaleTemplateInstallationRow[]> {
    return await tx
      .select({
        id: templateInstallationModel.id,
        workspaceId: templateInstallationModel.workspaceId,
      })
      .from(templateInstallationModel)
      .where(
        and(
          gt(templateInstallationModel.createdAt, input.createdAfter),
          unfinishedInstallation(input),
        ),
      )
      .orderBy(asc(templateInstallationModel.createdAt))
      .limit(input.limit)
  },

  /** Closes unfinished installations older than `createdBefore` as `failed`. Returns how many. */
  async failAbandoned(
    input: {
      createdBefore: Date
      pendingBefore: Date
      leaseExpiredBefore: Date
      errorCode: string
      errorMessage: string
    },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        status: "failed",
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        claimToken: null,
        completedAt: new Date(),
      })
      .where(
        and(
          lt(templateInstallationModel.createdAt, input.createdBefore),
          unfinishedInstallation(input),
        ),
      )
      .returning({ id: templateInstallationModel.id })
    return rows.length
  },
}
