import { prisma } from "@ahachat.ai/database"
import { getLogger } from "../../lib/log"
import {
  chatQueue,
  ChatJobAction,
  integrationQueue,
  IntegrationJobAction,
} from "@ahachat.ai/worker-config"
import type { OutgoingMessageEntity } from "@ahachat.ai/sdk"
import { createId } from "@paralleldrive/cuid2"
import { StepType } from "@ahachat.ai/flow-config"

enum ReplyType {
  MESSAGE = "MESSAGE",
  FLOW = "FLOW",
}

export type ReplyMessage = {
  message: string
  type: ReplyType.MESSAGE
  buttons: {
    url: string
    label: string
  }[]
}

export type ReplyFlow = {
  type: ReplyType.FLOW
  flowId: string
}

export type Reply = ReplyMessage | ReplyFlow

export const listAllAutomatedResponses = async ({
  chatbotId,
}: { chatbotId: string }) => {
  const logger = getLogger("integration")

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
  if (!message.content) return

  const allAutomatedResponses = await listAllAutomatedResponses({
    chatbotId: message.chatbotId,
  })
  for (const automatedResponse of allAutomatedResponses) {
    // Trigger flow if message matched automatedResponses config
    const matched = automatedResponse.userMessages.some((v) =>
      (message.content ?? "").includes(v),
    )
    if (matched) {
      for (const reply of automatedResponse.replies as Reply[]) {
        switch (reply.type) {
          case ReplyType.MESSAGE:
            await chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
              type: ChatJobAction.SEND_FLOW_STEP,
              data: {
                conversationId: message.conversationId,
                flowVersionId: "",
                step: {
                  id: createId(),
                  message: reply.message,
                  stepType: StepType.SendText,
                  buttons: [],
                },
              },
            })
            break

          case ReplyType.FLOW:
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
