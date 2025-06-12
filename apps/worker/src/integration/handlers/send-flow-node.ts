import { prisma, type Conversation } from "@ahachat.ai/database"
import { StepType, type FlowNode } from "@ahachat.ai/flow-config"
import { SdkException } from "@ahachat.ai/sdk"
import {
  ChatJobAction,
  chatQueue,
  type IntegrationJobSendFlow,
} from "@ahachat.ai/worker-config"

export const sendFlowNode = async (props: IntegrationJobSendFlow) => {
  if (!props.data.flowId && !props.data.flowVersionId) {
    throw new SdkException("Expect flowId or flowVersionId to sendFlowNode")
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: props.data.conversationId,
    },
  })
  if (!conversation) {
    throw new SdkException("Conversation not found")
  }

  // Try to find corresponding flowVersion
  let flowVersion = null
  if (props.data.flowVersionId) {
    flowVersion = await prisma.flowVersion.findFirst({
      where: {
        id: props.data.flowVersionId,
        chatbotId: conversation.chatbotId,
      },
    })
  } else {
    const flow = await prisma.flow.findFirst({
      where: {
        chatbotId: conversation.chatbotId,
        id: props.data.flowId,
        active: true,
      },
    })
    if (!flow || !flow.currentVersionId) {
      throw new SdkException("Flow not valid")
    }

    flowVersion = await prisma.flowVersion.findFirst({
      where: {
        id: flow.currentVersionId,
      },
    })
  }
  if (!flowVersion) {
    throw new SdkException("FlowVersion not found")
  }

  // NOTES: process flow
  const startNode = (flowVersion.nodes as unknown as FlowNode[]).find((n) =>
    props.data.nodeId ? n.id === props.data.nodeId : n.data.isStartNode,
  )
  if (!startNode) {
    throw new SdkException("FlowVersion does not contain start node")
  }

  for await (const stepResponse of runFlowNode(
    conversation,
    flowVersion.id,
    startNode,
  )) {
    console.log(`Handled: ${stepResponse}`)
  }
}

async function* runFlowNode(
  conversation: Conversation,
  flowVersionId: string,
  node: FlowNode,
) {
  for (const step of node.data.steps) {
    switch (step.stepType) {
      case StepType.SEND_TEXT:
      // case StepType.SendAudio:
      // case StepType.SendVideo:
      // case StepType.SendFile:
      // case StepType.SendGif:
      // case StepType.SendCard:
      // case StepType.SendCarousel:
      case StepType.SEND_IMAGE: {
        chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
          type: ChatJobAction.SEND_FLOW_STEP,
          data: {
            conversationId: conversation.id,
            flowVersionId,
            step,
          },
        })
        break
      }
      case StepType.SET_CUSTOM_FIELD: {
        await prisma.contactCustomField.upsert({
          create: {
            contactId: conversation.contactId,
            customFieldId: step.customFieldId,
            value: step.value,
          },
          where: {
            contactId_customFieldId: {
              contactId: conversation.contactId,
              customFieldId: step.customFieldId,
            },
          },
          update: {
            value: step.value,
          },
        })
        break
      }
      case StepType.CLEAR_CUSTOM_FIELD: {
        await prisma.contactCustomField.deleteMany({
          where: {
            contactId: conversation.contactId,
            customFieldId: step.customFieldId,
          },
        })
        break
      }
      case StepType.ADD_NOTES: {
        await prisma.contactNote.create({
          data: {
            contactId: conversation.contactId,
            content: step.content,
          },
        })
      }
    }
    yield step.stepType
  }
}
