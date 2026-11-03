import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { mobileRefreshTokenRepository } from "@chatbotx.io/database/repositories"
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
      await mobileRefreshTokenRepository.deleteExpiredForUser(
        userId,
        new Date(),
        tx,
      )
    }
    const token = generateRefreshToken()
    const expiresAt = new Date(Date.now() + MOBILE_REFRESH_TOKEN_TTL_MS)
    await mobileRefreshTokenRepository.insert(
      {
        userId,
        deviceId,
        familyId: familyId ?? createId(),
        tokenHash: await hashToken(token),
        expiresAt,
      },
      tx,
    )
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
      const spent = await mobileRefreshTokenRepository.spendActive(
        tokenHash,
        now,
        tx,
      )

      if (spent) {
        const refreshToken = await this.issue({
          tx,
          userId: spent.userId,
          deviceId: spent.deviceId,
          familyId: spent.familyId,
        })
        await mobileRefreshTokenRepository.deleteSpentInFamily(
          spent.familyId,
          new Date(now.getTime() - SPENT_TOKEN_RETENTION_MS),
          tx,
        )
        return {
          kind: "rotated" as const,
          userId: spent.userId,
          deviceId: spent.deviceId,
          refreshToken,
        }
      }

      const existing = await mobileRefreshTokenRepository.findByHash(
        tokenHash,
        tx,
      )
      if (!existing) {
        return { kind: "invalid" as const }
      }
      if (existing.rotatedAt || existing.revoked) {
        await mobileRefreshTokenRepository.revokeFamilyByHash(
          tokenHash,
          now,
          tx,
        )
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

  /** Logout: revokes the family a presented token belongs to. Unknown tokens are a no-op. */
  async revokeByToken(props: { token: string }): Promise<void> {
    await mobileRefreshTokenRepository.revokeFamilyByHash(
      await hashToken(props.token),
      new Date(),
    )
  }

  /** Password change/reset: every device must sign in again. */
  async revokeAllForUser(props: {
    tx?: DatabaseClient
    userId: string
  }): Promise<void> {
    const { tx = db, userId } = props
    await mobileRefreshTokenRepository.revokeAllForUser(userId, new Date(), tx)
  }
}

export const mobileRefreshTokenService = new MobileRefreshTokenService()
