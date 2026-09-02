import {
  type MetaConversionsChannel,
  metaConversionsService,
} from "@chatbotx.io/business"
import type { SendMetaCapiEventSchema } from "@chatbotx.io/flow-config"
import { logger } from "../../../lib/logger"
import type { ExecuteStepProps } from "../flow-utils"
import type { ExecuteStepResult } from "../step"

const supportedChannels = new Set<string>([
  "messenger",
  "instagram",
  "whatsapp",
])

function isMetaConversionsChannel(
  channel: string,
): channel is MetaConversionsChannel {
  return supportedChannels.has(channel)
}

export async function handleSendMetaCapiEventStep(
  props: ExecuteStepProps<SendMetaCapiEventSchema>,
): Promise<ExecuteStepResult> {
  const { contactInbox, conversation, step } = props

  try {
    if (!isMetaConversionsChannel(contactInbox.channel)) {
      return {
        status: "error",
        result: null,
        errorMessage: `Unsupported Meta CAPI channel: ${contactInbox.channel}`,
      }
    }

    await metaConversionsService.enqueueLeadEvent({
      workspaceId: conversation.workspaceId,
      channel: contactInbox.channel,
      contactInboxId: contactInbox.id,
      inboxId: contactInbox.inboxId,
      source: "flowStep",
      sourceKey: metaConversionsService.buildLeadSourceKey({
        scope: "flow",
        scopeId: step.id,
        contactInboxId: contactInbox.id,
        channel: contactInbox.channel,
      }),
      value: step.value,
      currency: step.currency,
      contentCategory: step.contentCategory,
      contentName: step.contentName,
    })

    return { status: "success", result: null }
  } catch (error) {
    logger.warn(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        stepId: step.id,
      },
      "Failed to enqueue Meta CAPI flow step event",
    )

    return {
      status: "error",
      result: null,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to enqueue Meta CAPI event",
    }
  }
}
