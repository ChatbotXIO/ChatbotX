import { workspaceService } from "@chatbotx.io/business"
import { simpleQueue } from "@chatbotx.io/redis"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { getKey } from "./constants"
import { logger } from "./lib/logger"
import { resolveAutomatedResponseTiming } from "./smart-delay"

export const enqueueMessage = async (props: {
  conversationId: string
  contactInboxId: string
  messageId: string
  workspaceId: string
}) => {
  const key = getKey(props)
  let timing = resolveAutomatedResponseTiming(null)

  try {
    const workspace = await workspaceService.findById({ id: props.workspaceId })
    timing = resolveAutomatedResponseTiming(workspace)
  } catch (error) {
    logger.warn(error, "Smart delay lookup failed; using default timing")
  }

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
            ttl: timing.ttlSeconds * 1000,
            extend: true,
            replace: true,
          },
          delay: timing.delaySeconds * 1000,
        },
      ),
      simpleQueue.enqueue(
        key,
        props.messageId,
        timing.ttlSeconds * 5000, // keep the key longer than process job
      ),
    ])
  } catch (error) {
    logger.error(error, "Unable to trigger automated response")
  }
}
