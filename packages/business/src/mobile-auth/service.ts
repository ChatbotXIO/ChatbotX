import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  isNull,
  lt,
} from "@chatbotx.io/database/client"
import { mobileRefreshTokenModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { hashToken } from "../workspace-api-token/credentials"

export const MOBILE_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Spent tokens are kept this long so a replay is still recognised as theft
// (and revokes the family) rather than looking like an unknown token. A
// signed-in device rotates about every 10 minutes, so without a bound a family
// would grow by ~144 rows a day.
const SPENT_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000

const REFRESH_TOKEN_PREFIX = "cbx_mrt_"
const REFRESH_TOKEN_BYTES = 32
const BASE64_PADDING_PATTERN = /=+$/

const generateRefreshToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(REFRESH_TOKEN_BYTES))
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING_PATTERN, "")
  return `${REFRESH_TOKEN_PREFIX}${encoded}`
}

export type IssuedMobileRefreshToken = {
  token: string
  expiresAt: Date
}

export type MobileRefreshRotation =
  | {
      kind: "rotated"
      userId: string
      deviceId: string
      refreshToken: IssuedMobileRefreshToken
    }
  | { kind: "invalid" }
  // A token that was already rotated or revoked was presented again: the
  // whole family has been revoked.
  | { kind: "reused"; userId: string; deviceId: string }

/**
 * Opaque rotating refresh tokens for the native mobile app. Tokens are
 * CSPRNG-minted, stored hash-only, single-use (rotated on every refresh), and
 * a replay of a spent token revokes its whole family (one login on one device).
 */
class MobileRefreshTokenService {
  async issue(props: {
    tx?: DatabaseClient
    userId: string
    deviceId: string
    familyId?: string
  }): Promise<IssuedMobileRefreshToken> {
    const { tx = db, userId, deviceId, familyId } = props
    if (!familyId) {
      // A new login: sweep this user's tokens that expired and can never be used.
      await tx
        .delete(mobileRefreshTokenModel)
        .where(
          and(
            eq(mobileRefreshTokenModel.userId, userId),
            lt(mobileRefreshTokenModel.expiresAt, new Date()),
          ),
        )
    }
    const token = generateRefreshToken()
    const expiresAt = new Date(Date.now() + MOBILE_REFRESH_TOKEN_TTL_MS)
    await tx.insert(mobileRefreshTokenModel).values({
      userId,
      deviceId,
      familyId: familyId ?? createId(),
      tokenHash: await hashToken(token),
      expiresAt,
    })
    return { token, expiresAt }
  }

  /**
   * Atomically spends `token` and issues its successor in the same family.
   * The `rotatedAt IS NULL` guard on the UPDATE makes concurrent refreshes with
   * one token race to a single winner; the loser is treated as a replay.
   */
  async rotate(props: { token: string }): Promise<MobileRefreshRotation> {
    const tokenHash = await hashToken(props.token)
    return await db.transaction(async (tx) => {
      const now = new Date()
      const [spent] = await tx
        .update(mobileRefreshTokenModel)
        .set({ rotatedAt: now })
        .where(
          and(
            eq(mobileRefreshTokenModel.tokenHash, tokenHash),
            isNull(mobileRefreshTokenModel.rotatedAt),
            isNull(mobileRefreshTokenModel.revokedAt),
            gt(mobileRefreshTokenModel.expiresAt, now),
          ),
        )
        .returning()

      if (spent) {
        const refreshToken = await this.issue({
          tx,
          userId: spent.userId,
          deviceId: spent.deviceId,
          familyId: spent.familyId,
        })
        await tx
          .delete(mobileRefreshTokenModel)
          .where(
            and(
              eq(mobileRefreshTokenModel.familyId, spent.familyId),
              lt(
                mobileRefreshTokenModel.rotatedAt,
                new Date(now.getTime() - SPENT_TOKEN_RETENTION_MS),
              ),
            ),
          )
        return {
          kind: "rotated" as const,
          userId: spent.userId,
          deviceId: spent.deviceId,
          refreshToken,
        }
      }

      const [existing] = await tx
        .select()
        .from(mobileRefreshTokenModel)
        .where(eq(mobileRefreshTokenModel.tokenHash, tokenHash))
        .limit(1)
      if (!existing) {
        return { kind: "invalid" as const }
      }
      if (existing.rotatedAt || existing.revokedAt) {
        await this.revokeFamily({ tx, familyId: existing.familyId })
        return {
          kind: "reused" as const,
          userId: existing.userId,
          deviceId: existing.deviceId,
        }
      }
      // Present, unspent and unrevoked, so it can only have expired.
      return { kind: "invalid" as const }
    })
  }

  async revokeFamily(props: {
    tx?: DatabaseClient
    familyId: string
  }): Promise<void> {
    const { tx = db, familyId } = props
    await tx
      .update(mobileRefreshTokenModel)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mobileRefreshTokenModel.familyId, familyId),
          isNull(mobileRefreshTokenModel.revokedAt),
        ),
      )
  }

  /** Logout: revokes the family a presented token belongs to. Unknown tokens are a no-op. */
  async revokeByToken(props: { token: string }): Promise<void> {
    const tokenHash = await hashToken(props.token)
    const [row] = await db
      .select({ familyId: mobileRefreshTokenModel.familyId })
      .from(mobileRefreshTokenModel)
      .where(eq(mobileRefreshTokenModel.tokenHash, tokenHash))
      .limit(1)
    if (row) {
      await this.revokeFamily({ familyId: row.familyId })
    }
  }

  /** Password change/reset: every device must sign in again. */
  async revokeAllForUser(props: {
    tx?: DatabaseClient
    userId: string
  }): Promise<void> {
    const { tx = db, userId } = props
    await tx
      .update(mobileRefreshTokenModel)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mobileRefreshTokenModel.userId, userId),
          isNull(mobileRefreshTokenModel.revokedAt),
        ),
      )
  }
}

export const mobileRefreshTokenService = new MobileRefreshTokenService()
