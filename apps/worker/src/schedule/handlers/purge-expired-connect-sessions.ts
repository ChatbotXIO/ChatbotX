import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-expired-connect-sessions")

/**
 * Flips every `ConnectSession` past `expiresAt` to `status = "expired"`.
 * Every reader already treats a past-`expiresAt` row as expired regardless
 * of its stored status (`ConnectSessionService`'s lazy `applyExpiryRule`),
 * so this is display/reporting hygiene and the `countActiveByWorkspaceId`
 * pending-session cap, not a correctness dependency — but without it,
 * abandoned sessions (and the `encryptedAuth` they carry) accumulate at
 * rest indefinitely instead of reading as terminal.
 */
export async function purgeExpiredConnectSessions(): Promise<void> {
  const purged = await connectSessionService.purgeExpired()
  if (purged > 0) {
    log.info({ purged }, "purgeExpiredConnectSessions: sessions expired")
  }
}
