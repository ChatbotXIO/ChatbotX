import { prisma } from "@aha.chat/database"
import type {
  ConversationModel,
  FlowVersionModel,
} from "@aha.chat/database/types"
import { type FlowNode, StepType } from "@aha.chat/flow-config"
import { SdkException } from "@aha.chat/sdk"
import type { IntegrationJobSendFlow } from "@aha.chat/worker-config"
import {
  addContactNotes,
  addContactTag,
  blockContact,
  clearContactCustomField,
  deleteContact,
  markEmailVerified,
  optInEmail,
  optOutEmail,
  removeContactTag,
  setContactCustomField,
} from "./contact-handler"
import {
  archiveConversation,
  assignConversation,
  autoAssignConversation,
  disableBot,
  enableBot,
  followConversation,
  unarchiveConversation,
  unassignConversation,
  unfollowConversation,
} from "./conversation-handler"
import { dispatchFlowStep, type FlowStepProps } from "./step-handler"
import {
  countCharacters,
  formatDate,
  generateCode,
  getDataFromJSON,
} from "./tool-handler"

const flowStepHandlers: Record<
  StepType,
  // biome-ignore lint/suspicious/noExplicitAny: wip
  ((props: FlowStepProps<any>) => Promise<void>) | undefined
> = {
  [StepType.addContactNotes]: addContactNotes,
  [StepType.addContactTag]: addContactTag,
  [StepType.archiveConversation]: archiveConversation,
  [StepType.assignConversation]: assignConversation,
  [StepType.autoAssignConversation]: autoAssignConversation,
  [StepType.blockContact]: blockContact,
  [StepType.callApi]: undefined,
  [StepType.cancelContactInput]: undefined,
  [StepType.clearCustomField]: clearContactCustomField,
  [StepType.countCharacters]: countCharacters,
  [StepType.deleteContact]: deleteContact,
  [StepType.disableBot]: disableBot,
  [StepType.enableBot]: enableBot,
  [StepType.followConversation]: followConversation,
  [StepType.formatDate]: formatDate,
  [StepType.generateCode]: generateCode,
  [StepType.getDataFromJson]: getDataFromJSON,
  [StepType.landingPage]: undefined,
  [StepType.markEmailVerified]: markEmailVerified,
  [StepType.notifyAgent]: undefined,
  [StepType.openWebsite]: undefined,
  [StepType.aiAnalyzeImage]: undefined,
  [StepType.aiDeleteMessageHistory]: undefined,
  [StepType.aiGenerateImage]: undefined,
  [StepType.aiGenerateTextAgent]: undefined,
  [StepType.aiGenerateText]: undefined,
  [StepType.aiSpeechToText]: undefined,
  [StepType.aiTextToSpeech]: undefined,
  [StepType.optInEmail]: optInEmail,
  [StepType.optOutEmail]: optOutEmail,
  [StepType.performAction]: undefined,
  [StepType.removeContactTag]: removeContactTag,
  [StepType.sendAudio]: dispatchFlowStep,
  [StepType.sendCard]: undefined,
  [StepType.sendCarousel]: undefined,
  [StepType.sendFile]: dispatchFlowStep,
  [StepType.sendGif]: undefined,
  [StepType.sendImage]: dispatchFlowStep,
  [StepType.sendMessengerOtn]: undefined,
  [StepType.sendText]: dispatchFlowStep,
  [StepType.sendVideo]: dispatchFlowStep,
  [StepType.setCustomField]: setContactCustomField,
  [StepType.setDebounce]: undefined,
  [StepType.unarchiveConversation]: unarchiveConversation,
  [StepType.unassignConversation]: unassignConversation,
  [StepType.unfollowConversation]: unfollowConversation,
  [StepType.waitUserReply]: undefined,
  [StepType.wait]: undefined,
  [StepType.startExternalFlow]: undefined,
  [StepType.chooseChannel]: undefined,
  [StepType.filterContact]: undefined,
  [StepType.subscribeBroadcast]: undefined,
  [StepType.unsubscribeBroadcast]: undefined,
  [StepType.splitTraffic]: undefined,
  [StepType.startAnotherNode]: undefined,
  [StepType.startExternalNode]: undefined,
  [StepType.addNotes]: undefined,
  [StepType.userInput]: undefined,
}

export const sendFlowNode = async (props: IntegrationJobSendFlow) => {
  if (!(props.data.flowId || props.data.flowVersionId)) {
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
  let flowVersion: FlowVersionModel | null = null
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
    if (!flow?.currentVersionId) {
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

  const gen = runFlowNode(conversation, flowVersion.id, startNode)
  let result = await gen.next()

  while (!result.done) {
    result = await gen.next()
  }
}

function* runFlowNode(
  conversation: ConversationModel,
  flowVersionId: string,
  node: FlowNode,
) {
  const steps = ("steps" in node.data ? node.data.steps : []) ?? []
  for (const step of steps) {
    yield flowStepHandlers[step.stepType as StepType]?.({
      conversation,
      flowVersionId,
      step,
    })
  }
}
