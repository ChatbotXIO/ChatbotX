import { agentSipPresenceRepository } from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("expire-agent-sip-presence")

/** Rows past this age are dropped even if a `sofia::expire` event was missed. */
const STALE_PRESENCE_AGE_MS = 24 * 60 * 60 * 1000

/** Daily sweeper: drops stale `AgentSipPresence` rows. */
export async function expireAgentSipPresence(): Promise<void> {
  const deleted = await agentSipPresenceRepository.deleteExpired({
    olderThan: new Date(Date.now() - STALE_PRESENCE_AGE_MS),
  })
  if (deleted > 0) {
    log.info({ deleted }, "Deleted stale AgentSipPresence rows")
  }
}
