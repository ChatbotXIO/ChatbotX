/**
 * Re-encrypts `User.connectionAuthorizations` entries (every provider of every
 * user) onto the active key. Used by `rotate-encryption-key.ts`.
 *
 * Keyset-paginated by user id, so memory stays bounded however many users hold
 * a backup. Idempotent: entries already under the active kid are skipped. Safe
 * against a live `recordConnectionAuthorization`: an entry is replaced only
 * while it is still the one that was read, so a newer write is never lost.
 */
import type { EncryptedData } from "@chatbotx.io/encryption"
import { type DatabaseClient, toLoggableDatabaseError } from "../src/client"
import {
  type UserConnectionAuthorization,
  userConnectionAuthorizationAad,
} from "../src/partials/connection"
import type { IntegrationType } from "../src/partials/integration"
import { userRepository } from "../src/repositories/user/repository"

const CONNECTION_AUTHORIZATION_ROTATION_BATCH_SIZE = 200

type ProviderEntry = [IntegrationType, UserConnectionAuthorization]

export type ConnectionAuthorizationCrypto = {
  decrypt: (
    blob: UserConnectionAuthorization["encryptedAuth"],
    aad: string,
  ) => Promise<unknown>
  encrypt: (auth: unknown, aad: string) => Promise<EncryptedData>
}

export type ConnectionAuthorizationRotationResult = {
  scanned: number
  toRotate: number
  rotated: number
  skippedChanged: number
  errors: number
}

export const rotateConnectionAuthorizations = async (options: {
  activeKid: string
  dryRun: boolean
  crypto: ConnectionAuthorizationCrypto
  batchSize?: number
  tx?: DatabaseClient
}): Promise<ConnectionAuthorizationRotationResult> => {
  const batchSize =
    options.batchSize ?? CONNECTION_AUTHORIZATION_ROTATION_BATCH_SIZE
  const result: ConnectionAuthorizationRotationResult = {
    scanned: 0,
    toRotate: 0,
    rotated: 0,
    skippedChanged: 0,
    errors: 0,
  }
  let afterId: string | null = null

  while (true) {
    const page = await userRepository.listConnectionAuthorizationsAfter(
      { afterId, limit: batchSize },
      options.tx,
    )
    if (page.length === 0) {
      break
    }
    for (const user of page) {
      result.scanned++
      const entries = Object.entries(
        user.connectionAuthorizations,
      ) as ProviderEntry[]
      for (const [provider, entry] of entries) {
        if (entry.encryptedAuth.kid === options.activeKid) {
          continue
        }
        result.toRotate++
        if (options.dryRun) {
          continue
        }
        try {
          const aad = userConnectionAuthorizationAad(user.id, provider)
          const auth = await options.crypto.decrypt(entry.encryptedAuth, aad)
          const encryptedAuth = await options.crypto.encrypt(auth, aad)
          const replaced =
            await userRepository.replaceConnectionAuthorizationCiphertext(
              { userId: user.id, provider, expected: entry, encryptedAuth },
              options.tx,
            )
          if (replaced) {
            result.rotated++
          } else {
            result.skippedChanged++
          }
        } catch (error) {
          console.error(
            `[userId:${user.id} provider:${provider}] Failed:`,
            toLoggableDatabaseError(error),
          )
          result.errors++
        }
      }
    }
    afterId = page.at(-1)?.id ?? null
    if (page.length < batchSize) {
      break
    }
  }

  return result
}
