import { AIJobAction, aiAgentQueue } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "./lib/logger"

/**
 * Classifies an explicit request to return from human handoff to the bot.
 * This intentionally bypasses the normal automated-response debounce: it is
 * a state-transition decision, keyed idempotently by the inbound message.
 */
export async function enqueueHandoffReentry(props: {
  conversationId: string
  contactInboxId: string
  messageId: string
  workspaceId: string
}): Promise<void> {
  try {
    await aiAgentQueue.add(
      AIJobAction.processHandoffReentry,
      {
        type: AIJobAction.processHandoffReentry,
        data: {
          conversationId: props.conversationId,
          contactInboxId: props.contactInboxId,
          messageId: props.messageId,
        },
      },
      {
        jobId: `handoff-reentry-${props.messageId}`,
        deduplication: {
          id: `handoff-reentry-${props.messageId}`,
          ttl: 5 * 60 * 1000,
          extend: true,
          replace: true,
        },
      },
    )
  } catch (error) {
    logger.error(
      {
        err: normalizeError(error),
        workspaceId: props.workspaceId,
        conversationId: props.conversationId,
        messageId: props.messageId,
      },
      "Unable to trigger handoff re-entry classifier",
    )
  }
}
