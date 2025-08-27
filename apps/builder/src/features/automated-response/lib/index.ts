import { prisma } from "@aha.chat/database"
import { StepType } from "@aha.chat/flow-config"
import type { OutgoingMessageEntity } from "@aha.chat/sdk"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { ReplyType } from "../schemas/create-automated-responses-schema"

type ReplyMessage = {
  message: string
  type: typeof ReplyType.MESSAGE
  buttons: {
    url: string
    label: string
  }[]
}

type ReplyFlow = {
  type: typeof ReplyType.FLOW
  flowId: string
}

export type Reply = ReplyMessage | ReplyFlow

export async function triggerAutomatedResponse({
  message,
}: {
  message: OutgoingMessageEntity
}) {
  if (!message.content) {
    return
  }

  const allAutomatedResponses = await prisma.automatedResponse.findMany({
    where: {
      chatbotId: message.chatbotId,
    },
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
                  stepType: StepType.SEND_TEXT,
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
