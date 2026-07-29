import { integrationWhatsappService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-whatsapp-signup-sessions")

const MAX_BATCHES_PER_RUN = 20
const INTER_BATCH_DELAY_MS = 100

/**
 * Drops WhatsApp signup sessions that can never be used again — already spent,
 * or past their expiry.
 *
 * Each row holds an encrypted Meta access token, so without this the tokens
 * accumulate at rest indefinitely; the sessions themselves stop being usable
 * long before that. Batched with a pause between passes so a backlog does not
 * hold locks on the table for the whole run.
 */
export async function purgeWhatsappSignupSessions(): Promise<void> {
  let totalDeleted = 0

  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
    const deleted =
      await integrationWhatsappService.purgeFinishedSignupSessions()

    totalDeleted += deleted

    // An empty pass means the backlog is drained. Stopping on the count rather
    // than on the batch size keeps the batch size a repository detail.
    if (deleted === 0) {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS))
  }

  if (totalDeleted > 0) {
    log.info(
      { deleted: totalDeleted },
      "purgeWhatsappSignupSessions: rows purged",
    )
  }
}
