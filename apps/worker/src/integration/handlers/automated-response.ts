import { prisma } from "@ahachat.ai/database"
import { getLogger } from "../../lib/log"
import { integrationQueue } from "@ahachat.ai/worker-config"
import type { TriggerFlowProps } from "./trigger-flow-node"
import type { TriggerMessageProps } from "./trigger-message"
import { IntegrationAction } from "../types"

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

export const triggerAutomatedResponse = async ({
  chatbotId,
  messageContent,
}: { chatbotId: string; messageContent: string }) => {
  const allAutomatedResponses = await listAllAutomatedResponses({ chatbotId })
  for (const automatedResponse of allAutomatedResponses) {
    // Trigger flow if message matched automatedResponses config
    const matched = automatedResponse.userMessages.some((v) =>
      messageContent.includes(v),
    )
    if (matched) {
      for (const reply of automatedResponse.replies as Reply[]) {
        if (reply.type === ReplyType.FLOW) {
          await integrationQueue.add(IntegrationAction.SEND_FLOW_NODE, {
            flowId: reply.flowId,
          } as TriggerFlowProps)
        } else if (reply.type === ReplyType.MESSAGE) {
          await integrationQueue.add(
            IntegrationAction.SEND_MESSAGE,
            {} as TriggerMessageProps,
          )
        }
      }
    }
  }
}
