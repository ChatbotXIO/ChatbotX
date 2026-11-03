import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
} from "../../client"
import { mobileRefreshTokenModel } from "../../schema"
import type { MobileRefreshTokenModel } from "../../types"

const REVOKED_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000

type MobileRefreshTokenInsert = Omit<
  typeof mobileRefreshTokenModel.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>

class MobileRefreshTokenRepository {
  async insert(
    values: MobileRefreshTokenInsert,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx.insert(mobileRefreshTokenModel).values(values)
  }

  async spendActive(
    tokenHash: string,
    now: Date,
    tx: DatabaseClient = db,
  ): Promise<MobileRefreshTokenModel | null> {
    const [row] = await tx
      .update(mobileRefreshTokenModel)
      .set({ rotatedAt: now })
      .where(
        and(
          eq(mobileRefreshTokenModel.tokenHash, tokenHash),
          isNull(mobileRefreshTokenModel.rotatedAt),
          isNull(mobileRefreshTokenModel.revoked),
          gt(mobileRefreshTokenModel.expiresAt, now),
        ),
      )
      .returning()

    return row ?? null
  }

  async findByHash(
    tokenHash: string,
    tx: DatabaseClient = db,
  ): Promise<MobileRefreshTokenModel | null> {
    const row = await tx.query.mobileRefreshTokenModel.findFirst({
      where: { tokenHash },
    })
    return row ?? null
  }

  async revokeFamily(
    familyId: string,
    now: Date,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(mobileRefreshTokenModel)
      .set({ revoked: now })
      .where(
        and(
          eq(mobileRefreshTokenModel.familyId, familyId),
          isNull(mobileRefreshTokenModel.revoked),
        ),
      )
  }

  async revokeFamilyByHash(
    tokenHash: string,
    now: Date,
    tx: DatabaseClient = db,
  ): Promise<void> {
    const matchingFamily = tx
      .select({ familyId: mobileRefreshTokenModel.familyId })
      .from(mobileRefreshTokenModel)
      .where(eq(mobileRefreshTokenModel.tokenHash, tokenHash))

    await tx
      .update(mobileRefreshTokenModel)
      .set({ revoked: now })
      .where(
        and(
          inArray(mobileRefreshTokenModel.familyId, matchingFamily),
          isNull(mobileRefreshTokenModel.revoked),
        ),
      )
  }

  async revokeAllForUser(
    userId: string,
    now: Date,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(mobileRefreshTokenModel)
      .set({ revoked: now })
      .where(
        and(
          eq(mobileRefreshTokenModel.userId, userId),
          isNull(mobileRefreshTokenModel.revoked),
        ),
      )
  }

  async deleteSpentInFamily(
    familyId: string,
    before: Date,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(mobileRefreshTokenModel)
      .where(
        and(
          eq(mobileRefreshTokenModel.familyId, familyId),
          lt(mobileRefreshTokenModel.rotatedAt, before),
        ),
      )
  }

  async deleteExpiredForUser(
    userId: string,
    now: Date,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(mobileRefreshTokenModel)
      .where(
        and(
          eq(mobileRefreshTokenModel.userId, userId),
          lt(mobileRefreshTokenModel.expiresAt, now),
        ),
      )
  }

  async deleteExpired(now: Date, tx: DatabaseClient = db): Promise<number> {
    const revokedBefore = new Date(now.getTime() - REVOKED_TOKEN_RETENTION_MS)
    const rows = await tx
      .delete(mobileRefreshTokenModel)
      .where(
        or(
          lt(mobileRefreshTokenModel.expiresAt, now),
          lt(mobileRefreshTokenModel.revoked, revokedBefore),
        ),
      )
      .returning({ id: mobileRefreshTokenModel.id })

    return rows.length
  }
}

export const mobileRefreshTokenRepository = new MobileRefreshTokenRepository()
