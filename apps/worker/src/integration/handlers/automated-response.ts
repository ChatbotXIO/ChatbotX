import { prisma } from "@aha.chat/database"
import {
  type AutomatedResponseReply,
  ReplyType,
} from "@aha.chat/database/types"
import { StepType } from "@aha.chat/flow-config"
import type { OutgoingMessageEntity } from "@aha.chat/sdk"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { logger } from "../../lib/logger"

export const listAllAutomatedResponses = async ({
  chatbotId,
}: {
  chatbotId: string
}) => {
  try {
    return await prisma.automatedResponse.findMany({
      where: { chatbotId },
    })
  } catch (err) {
    logger.error("Unable to list automated responses", err)
    return []
  }
}

export async function triggerAutomatedResponse({
  message,
}: {
  message: OutgoingMessageEntity
}) {
  if (!message.content) {
    return
  }

  const allAutomatedResponses = await listAllAutomatedResponses({
    chatbotId: message.chatbotId,
  })
  for (const automatedResponse of allAutomatedResponses) {
    // Trigger flow if message matched automatedResponses config
    const matched = automatedResponse.userMessages.some((v) =>
      (message.content ?? "").includes(v),
    )
    if (matched) {
      for (const reply of automatedResponse.replies as AutomatedResponseReply[]) {
        switch (reply.type) {
          case ReplyType.Message:
            await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
              type: ChatJobAction.SEND_FLOW_STEP,
              data: {
                conversationId: message.conversationId,
                flowVersionId: "",
                step: {
                  id: createId(),
                  message: reply.message,
                  stepType: StepType.sendText,
                  buttons: [],
                },
              },
            })
            break

          case ReplyType.Flow:
            await integrationQueue.add(IntegrationJobAction.SEND_FLOW, {
              type: IntegrationJobAction.SEND_FLOW,
              data: {
                conversationId: message.conversationId,
                flowId: reply.flowId,
              },
            })
            break

          default:
            break
        }
      }
    }
  }
}
