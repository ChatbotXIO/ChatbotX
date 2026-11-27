import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  isNotNull,
  isNull,
  isUniqueViolationError,
  lte,
  sql,
} from "../../client"
import type {
  UserConnectionAuthorization,
  UserConnectionAuthorizations,
} from "../../partials/connection"
import type { IntegrationType } from "../../partials/integration"
import { accountModel, userModel } from "../../schema"
import type { UserModel } from "../../types"
import { userColumnsWithoutSecrets } from "./columns"

class UserRepository {
  /** The user row without the secret columns (see `userColumnsWithoutSecrets`). */
  async findById(
    userId: string,
    tx: DatabaseClient = db,
  ): Promise<UserModel | undefined> {
    return await tx.query.userModel.findFirst({
      where: { id: userId },
      columns: userColumnsWithoutSecrets,
    })
  }

  async findIdByEmail(
    props: { email: string; tenantId: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string } | undefined> {
    return await tx.query.userModel.findFirst({
      where: { email: props.email, tenantId: props.tenantId },
      columns: { id: true },
    })
  }

  async insertWithCredential(props: {
    email: string
    name?: string
    hashedPassword: string
    tenantId: string
  }): Promise<{ userId: string; created: boolean }> {
    try {
      const userId = await db.transaction(async (tx) => {
        const [createdUser] = await tx
          .insert(userModel)
          .values({
            email: props.email,
            name: props.name,
            emailVerified: true,
            mustChangePassword: true,
            tenantId: props.tenantId,
          })
          .returning({ id: userModel.id })

        if (!createdUser) {
          throw new Error("Failed to create user with credential")
        }

        await tx.insert(accountModel).values({
          accountId: createdUser.id,
          providerId: "credential",
          password: props.hashedPassword,
          userId: createdUser.id,
          tenantId: props.tenantId,
        })

        return createdUser.id
      })

      return { userId, created: true }
    } catch (error) {
      if (isUniqueViolationError(error)) {
        const raced = await this.findIdByEmail({
          email: props.email,
          tenantId: props.tenantId,
        })
        if (raced) {
          return { userId: raced.id, created: false }
        }
      }
      throw error
    }
  }

  async findForAccountDeletion(userId: string, tx: DatabaseClient) {
    const [user] = await tx
      .select({
        deletionRequestedAt: userModel.deletionRequestedAt,
        id: userModel.id,
        scheduledDeletionAt: userModel.scheduledDeletionAt,
      })
      .from(userModel)
      .where(eq(userModel.id, userId))
      .limit(1)
      .for("update")
    return user
  }

  async listDueForPurge(input: {
    now: Date
    limit: number
  }): Promise<string[]> {
    const rows = await db
      .select({ id: userModel.id })
      .from(userModel)
      .where(
        and(
          isNotNull(userModel.deletionRequestedAt),
          isNotNull(userModel.scheduledDeletionAt),
          lte(userModel.scheduledDeletionAt, input.now),
        ),
      )
      .orderBy(userModel.scheduledDeletionAt, userModel.id)
      .limit(input.limit)
    return rows.map((row) => row.id)
  }

  async markDeletionRequested(
    input: {
      userId: string
      requestedAt: Date
      scheduledDeletionAt: Date
    },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(userModel)
      .set({
        deletionRequestedAt: input.requestedAt,
        scheduledDeletionAt: input.scheduledDeletionAt,
      })
      .where(eq(userModel.id, input.userId))
  }

  async deleteIfDue(input: {
    userId: string
    now: Date
    tx: DatabaseClient
  }): Promise<boolean> {
    const rows = await input.tx
      .delete(userModel)
      .where(
        and(
          eq(userModel.id, input.userId),
          isNotNull(userModel.deletionRequestedAt),
          lte(userModel.scheduledDeletionAt, input.now),
        ),
      )
      .returning({ id: userModel.id })
    return rows.length > 0
  }

  /**
   * Stores one provider's authorization backup on the user in a single
   * statement. `jsonb_set` touches only that provider's key, so concurrent
   * writes for different providers never overwrite each other, and the guard
   * lets a write land only when the stored `capturedAt` is absent or strictly
   * older, so a slow older attempt cannot replace a newer one. `updatedAt` is
   * assigned to itself so the `$onUpdate` hook does not bump it. A user with a
   * pending account deletion is never written, so an in-flight connect cannot
   * restore a secret the deletion request just cleared. Returns
   * whether the entry was written.
   */
  async recordConnectionAuthorization(
    input: {
      userId: string
      provider: IntegrationType
      entry: UserConnectionAuthorization
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const storedCapturedAt = sql`(${userModel.connectionAuthorizations} -> ${input.provider} ->> 'capturedAt')`
    const rows = await tx
      .update(userModel)
      .set({
        connectionAuthorizations: sql`jsonb_set(
          coalesce(${userModel.connectionAuthorizations}, '{}'::jsonb),
          ARRAY[${input.provider}]::text[],
          ${JSON.stringify(input.entry)}::jsonb,
          true
        )`,
        updatedAt: userModel.updatedAt,
      })
      .where(
        and(
          eq(userModel.id, input.userId),
          isNull(userModel.deletionRequestedAt),
          sql`(${storedCapturedAt} IS NULL OR ${storedCapturedAt}::timestamptz < ${input.entry.capturedAt}::timestamptz)`,
        ),
      )
      .returning({ id: userModel.id })
    return rows.length > 0
  }

  /** Nulls the backup (account deletion). Idempotent. */
  async clearConnectionAuthorizations(
    userId: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(userModel)
      .set({ connectionAuthorizations: null })
      .where(
        and(
          eq(userModel.id, userId),
          isNotNull(userModel.connectionAuthorizations),
        ),
      )
  }

  /** Keyset page (by id) of users that hold a backup. Key rotation only. */
  async listConnectionAuthorizationsAfter(
    input: { afterId: string | null; limit: number },
    tx: DatabaseClient = db,
  ): Promise<
    Array<{
      id: string
      connectionAuthorizations: UserConnectionAuthorizations
    }>
  > {
    const rows = await tx
      .select({
        id: userModel.id,
        connectionAuthorizations: userModel.connectionAuthorizations,
      })
      .from(userModel)
      .where(
        and(
          isNotNull(userModel.connectionAuthorizations),
          input.afterId ? gt(userModel.id, input.afterId) : undefined,
        ),
      )
      .orderBy(userModel.id)
      .limit(input.limit)
    // The `isNotNull` filter above guarantees a value; the fallback only
    // narrows the type, so the page stays the raw keyset page.
    return rows.map((row) => ({
      id: row.id,
      connectionAuthorizations: row.connectionAuthorizations ?? {},
    }))
  }

  /**
   * Swaps one provider entry's ciphertext, only while the stored entry is still
   * the one that was read (same `capturedAt` and ciphertext). A newer write
   * that landed meanwhile is already under the active key and is left alone.
   * `updatedAt` is untouched.
   */
  async replaceConnectionAuthorizationCiphertext(
    input: {
      userId: string
      provider: IntegrationType
      expected: UserConnectionAuthorization
      encryptedAuth: UserConnectionAuthorization["encryptedAuth"]
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const stored = sql`(${userModel.connectionAuthorizations} -> ${input.provider})`
    const rows = await tx
      .update(userModel)
      .set({
        connectionAuthorizations: sql`jsonb_set(
          ${userModel.connectionAuthorizations},
          ARRAY[${input.provider}, 'encryptedAuth']::text[],
          ${JSON.stringify(input.encryptedAuth)}::jsonb,
          false
        )`,
        updatedAt: userModel.updatedAt,
      })
      .where(
        and(
          eq(userModel.id, input.userId),
          sql`${stored} ->> 'capturedAt' = ${input.expected.capturedAt}`,
          sql`${stored} -> 'encryptedAuth' = ${JSON.stringify(input.expected.encryptedAuth)}::jsonb`,
        ),
      )
      .returning({ id: userModel.id })
    return rows.length > 0
  }

  async postponePurge(
    input: { userId: string; until: Date },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(userModel)
      .set({ scheduledDeletionAt: input.until })
      .where(
        and(
          eq(userModel.id, input.userId),
          isNotNull(userModel.deletionRequestedAt),
        ),
      )
  }
}

export const userRepository = new UserRepository()
