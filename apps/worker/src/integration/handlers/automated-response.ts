import { prisma } from "@ahachat.ai/database"
import { getLogger } from "../../lib/log"
import { chatQueue, ChatJobAction } from "@ahachat.ai/worker-config"
import type { OutgoingMessageEntity } from "@ahachat.ai/sdk"

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
            await chatQueue.add(ChatJobAction.TRIGGER_MESSAGE, {
              type: ChatJobAction.TRIGGER_MESSAGE,
              data: {
                conversationId: message.conversationId,
                content: reply.message,
              },
            })
            break

          // case ReplyType.FLOW:
          //   await integrationQueue.add(IntegrationJobAction.SEND_FLOW_NODE, {
          //     flowId: reply.flowId,
          //   } as TriggerFlowProps)
          //   break

          default:
            break
        }
      }
    }
  }
}
