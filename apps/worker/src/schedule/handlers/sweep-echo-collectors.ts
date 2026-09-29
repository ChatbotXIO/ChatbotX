import {
  LowJobAction,
  type LowJobMessengerEchoFlush,
  lowQueue,
} from "@chatbotx.io/worker-config"
import { echoCollector } from "@chatbotx.io/worker-config/messenger-echo"
import { env } from "../../env"
import { logger } from "../../lib/logger"

export const MESSENGER_ECHO_SWEEP_MAX_ENQUEUES = 500
const MESSENGER_ECHO_CHANNEL: LowJobMessengerEchoFlush["data"]["channel"] =
  "messenger"

export const sweepEchoCollectors = async (): Promise<void> => {
  let enqueued = 0
  for await (const scope of echoCollector.scanPending(MESSENGER_ECHO_CHANNEL)) {
    if (enqueued >= MESSENGER_ECHO_SWEEP_MAX_ENQUEUES) {
      break
    }
    if (
      !(await echoCollector.schedule(
        scope,
        env.MESSENGER_ECHO_SWEEP_CLAIM_TTL_MS,
      ))
    ) {
      continue
    }
    try {
      await lowQueue.add(LowJobAction.messengerEchoFlush, {
        type: LowJobAction.messengerEchoFlush,
        data: {
          channel: MESSENGER_ECHO_CHANNEL,
          integrationIdentifier: scope.identifier,
        },
      })
      enqueued += 1
    } catch (err) {
      try {
        await echoCollector.clearFlag(scope)
      } catch (clearErr) {
        logger.error(
          { err: clearErr, scope },
          "Failed to clear Messenger echo collector scheduling claim",
        )
      }
      logger.error(
        { err, scope },
        "Failed to enqueue pending Messenger echo collector flush",
      )
    }
  }

  logger.info({ enqueued }, "Enqueued pending Messenger echo collector flushes")
}
