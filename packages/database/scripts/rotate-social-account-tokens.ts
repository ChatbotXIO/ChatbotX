/**
 * Re-encrypts the tokens of every social account and destination onto the
 * active key. Used by `rotate-encryption-key.ts`.
 *
 * Keyset-paginated by id, so memory stays bounded however many accounts there
 * are. Idempotent: tokens already under the active kid are skipped. Safe against
 * a live reconnect or token refresh: a token is replaced only while it is still
 * the one that was read, so a newer write is never lost.
 */
import type { EncryptedData } from "@chatbotx.io/encryption"
import { toLoggableDatabaseError } from "../src/client"
import {
  socialAccountAad,
  socialDestinationAad,
} from "../src/partials/social-account"
import { socialAccountTokenRotationRepository } from "../src/repositories/social-account/token-rotation"

const SOCIAL_ACCOUNT_ROTATION_BATCH_SIZE = 200

export type SocialAccountTokenCrypto = {
  decrypt: (blob: EncryptedData, aad: string) => Promise<unknown>
  encrypt: (value: unknown, aad: string) => Promise<EncryptedData>
}

export type SocialAccountRotationResult = {
  errors: number
  rotated: number
  scanned: number
  skippedChanged: number
  toRotate: number
}

type Repository = Pick<
  typeof socialAccountTokenRotationRepository,
  | "listDestinationTokenRowsAfter"
  | "listTokenRowsAfter"
  | "replaceAccountTokenCiphertext"
  | "replaceDestinationTokenCiphertext"
>

const needsRotation = (blob: EncryptedData | null, activeKid: string) =>
  blob !== null && blob.kid !== activeKid

export const rotateSocialAccountTokens = async (options: {
  activeKid: string
  batchSize?: number
  crypto: SocialAccountTokenCrypto
  dryRun: boolean
  repository?: Repository
}): Promise<SocialAccountRotationResult> => {
  const repository = options.repository ?? socialAccountTokenRotationRepository
  const batchSize = options.batchSize ?? SOCIAL_ACCOUNT_ROTATION_BATCH_SIZE
  const result: SocialAccountRotationResult = {
    errors: 0,
    rotated: 0,
    scanned: 0,
    skippedChanged: 0,
    toRotate: 0,
  }

  const rotateBlob = async (
    blob: EncryptedData | null,
    aad: string,
  ): Promise<EncryptedData | null> =>
    blob === null
      ? null
      : await options.crypto.encrypt(
          await options.crypto.decrypt(blob, aad),
          aad,
        )

  let afterAccountId: string | null = null
  while (true) {
    const page = await repository.listTokenRowsAfter({
      afterId: afterAccountId,
      limit: batchSize,
    })
    if (page.length === 0) {
      break
    }
    for (const account of page) {
      result.scanned++
      const stale =
        needsRotation(account.accessToken, options.activeKid) ||
        needsRotation(account.refreshToken, options.activeKid)
      if (!stale) {
        continue
      }
      result.toRotate++
      if (options.dryRun) {
        continue
      }
      try {
        const aad = socialAccountAad(account.workspaceId, account.id)
        const replaced = await repository.replaceAccountTokenCiphertext({
          accessToken: await rotateBlob(account.accessToken, aad),
          expectedAccessToken: account.accessToken,
          expectedRefreshToken: account.refreshToken,
          id: account.id,
          refreshToken: await rotateBlob(account.refreshToken, aad),
        })
        if (replaced) {
          result.rotated++
        } else {
          result.skippedChanged++
        }
      } catch (error) {
        console.error(
          `[socialAccountId:${account.id}] Failed:`,
          toLoggableDatabaseError(error),
        )
        result.errors++
      }
    }
    afterAccountId = page.at(-1)?.id ?? null
    if (page.length < batchSize) {
      break
    }
  }

  let afterDestinationId: string | null = null
  while (true) {
    const page = await repository.listDestinationTokenRowsAfter({
      afterId: afterDestinationId,
      limit: batchSize,
    })
    if (page.length === 0) {
      break
    }
    for (const destination of page) {
      result.scanned++
      if (!needsRotation(destination.accessToken, options.activeKid)) {
        continue
      }
      result.toRotate++
      if (options.dryRun) {
        continue
      }
      try {
        const aad = socialDestinationAad(
          destination.workspaceId,
          destination.id,
        )
        const replaced = await repository.replaceDestinationTokenCiphertext({
          accessToken: await rotateBlob(destination.accessToken, aad),
          expectedAccessToken: destination.accessToken,
          id: destination.id,
        })
        if (replaced) {
          result.rotated++
        } else {
          result.skippedChanged++
        }
      } catch (error) {
        console.error(
          `[socialAccountDestinationId:${destination.id}] Failed:`,
          toLoggableDatabaseError(error),
        )
        result.errors++
      }
    }
    afterDestinationId = page.at(-1)?.id ?? null
    if (page.length < batchSize) {
      break
    }
  }

  return result
}
