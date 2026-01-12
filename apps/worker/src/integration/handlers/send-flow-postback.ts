import { prisma } from "@aha.chat/database"
import type {
  ConversationModel,
  FlowVersionModel,
} from "@aha.chat/database/types"
import { decodeButtonPayload, type FlowNode } from "@aha.chat/flow-config"
import { SdkException } from "@aha.chat/sdk"
import type {
  IntegrationJobSendFlowPostback,
  IntegrationJobSendFlowQuickReply,
} from "@aha.chat/worker-config"
import { runStepsAndQuickReplies } from "./send-flow-node"

async function findConversationAndFlowAndFlowVersion(props: {
  conversationId: string
  flowId: string
  flowVersionId?: string
}): Promise<{
  conversation: ConversationModel
  flowVersion: FlowVersionModel
}> {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: props.conversationId,
    },
  })
  if (!conversation) {
    throw new SdkException("Conversation not found")
  }

  let flowVersion: FlowVersionModel | null = null
  if (props.flowVersionId) {
    flowVersion = await prisma.flowVersion.findFirst({
      where: {
        id: props.flowVersionId,
        chatbotId: conversation.chatbotId,
      },
    })
  } else if (props.flowId) {
    const flow = await prisma.flow.findFirst({
      where: {
        id: props.flowId,
        chatbotId: conversation.chatbotId,
        active: true,
      },
    })
    if (flow?.currentVersionId) {
      flowVersion = await prisma.flowVersion.findFirst({
        where: {
          id: flow.currentVersionId,
          chatbotId: conversation.chatbotId,
        },
      })
    }
  }

  if (!flowVersion) {
    throw new SdkException("FlowVersion not found")
  }

  return { conversation, flowVersion }
}

export async function sendFlowPostback(
  data: IntegrationJobSendFlowPostback["data"],
) {
  const parsedAction = decodeButtonPayload(data.action)
  if (!parsedAction) {
    throw new SdkException("Invalid postback action")
  }

  const { conversation, flowVersion } =
    await findConversationAndFlowAndFlowVersion({
      conversationId: data.conversationId,
      flowId: parsedAction.flowId,
      flowVersionId: parsedAction.flowVersionId,
    })

  const nodes = flowVersion.nodes as unknown as FlowNode[]

  const foundedButton = nodes
    .flatMap((n) =>
      "steps" in n.data.details && n.data.details.steps
        ? n.data.details.steps
        : [],
    )
    .flatMap((s) => ("buttons" in s ? s.buttons : []))
    .find((b) => b.id === parsedAction.buttonId)

  if (!foundedButton) {
    return
  }

  await runStepsAndQuickReplies(
    conversation,
    flowVersion,
    foundedButton,
    foundedButton.id,
    false,
  )
}

export async function sendFlowQuickReply(
  data: IntegrationJobSendFlowQuickReply["data"],
) {
  const parsedAction = decodeButtonPayload(data.action)
  if (!parsedAction) {
    throw new SdkException("Invalid quick reply action")
  }

  const { conversation, flowVersion } =
    await findConversationAndFlowAndFlowVersion({
      conversationId: data.conversationId,
      flowId: parsedAction.flowId,
      flowVersionId: parsedAction.flowVersionId,
    })

  const nodes = flowVersion.nodes as unknown as FlowNode[]

  const foundedButton = nodes
    .flatMap((n) =>
      "quickReplies" in n.data.details && n.data.details.quickReplies
        ? n.data.details.quickReplies
        : [],
    )
    .find((b) => b.id === parsedAction.buttonId)

  if (!foundedButton) {
    return
  }

  await runStepsAndQuickReplies(
    conversation,
    flowVersion,
    foundedButton,
    foundedButton.id,
  )
}
