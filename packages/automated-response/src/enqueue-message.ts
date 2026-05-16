import { simpleQueue } from "@chatbotx.io/redis"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { getKey } from "./constants"
import { env } from "./keys"
import { logger } from "./lib/logger"

export const enqueueMessage = async (props: {
  conversationId: string
  contactInboxId: string
  messageId: string
}) => {
  const key = getKey(props)

  try {
    await Promise.all([
      integrationQueue.add(
        IntegrationJobAction.processAutomatedResonse,
        {
          type: IntegrationJobAction.processAutomatedResonse,
          data: {
            conversationId: props.conversationId,
            contactInboxId: props.contactInboxId,
            messageId: props.messageId,
          },
        },
        {
          deduplication: {
            id: key,
            ttl: env.AUTOMATED_RESPONSE_TTL_SECONDS * 1000,
            extend: true,
            replace: true,
          },
          delay: env.AUTOMATED_RESPONSE_DELAY_SECONDS * 1000,
        },
      ),
      simpleQueue.enqueue(
        key,
        props.messageId,
        env.AUTOMATED_RESPONSE_TTL_SECONDS * 5000, // keep the key longger than process job
      ),
    ])
  } catch (error) {
    logger.error(error, "Unable to trigger automated response")
  }
}
