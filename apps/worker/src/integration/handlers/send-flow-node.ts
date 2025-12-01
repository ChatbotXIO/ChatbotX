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
import { handleAIGenerateText } from "./generate-text"
import {
  clearSpreadsheetRow,
  getSpreadsheetRandomRow,
  getSpreadsheetRow,
  sendSpreadsheetData,
  updateSpreadsheetRow,
} from "./spreadsheet-handler"
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
  [StepType.openaiGenerateText]: handleAIGenerateText,
  [StepType.geminiGenerateText]: handleAIGenerateText,
  [StepType.claudeGenerateText]: handleAIGenerateText,
  [StepType.deepseekGenerateText]: handleAIGenerateText,
  [StepType.aiAnalyzeImage]: undefined,
  [StepType.aiDeleteMessageHistory]: undefined,
  [StepType.aiGenerateImage]: undefined,
  [StepType.aiGenerateTextAgent]: undefined,
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
  [StepType.sendGif]: dispatchFlowStep,
  [StepType.sendImage]: dispatchFlowStep,
  [StepType.sendMessengerOtn]: undefined,
  [StepType.sendText]: dispatchFlowStep,
  [StepType.sendVideo]: dispatchFlowStep,
  [StepType.setCustomField]: setContactCustomField,
  [StepType.setDebounce]: undefined,
  [StepType.unarchiveConversation]: unarchiveConversation,
  [StepType.unassignConversation]: unassignConversation,
  [StepType.unfollowConversation]: unfollowConversation,
  [StepType.getUserInput]: undefined,
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
  [StepType.spreadsheetGetRow]: getSpreadsheetRow,
  [StepType.spreadsheetClearRow]: clearSpreadsheetRow,
  [StepType.spreadsheetGetRandomRow]: getSpreadsheetRandomRow,
  [StepType.spreadsheetSendData]: sendSpreadsheetData,
  [StepType.spreadsheetUpdateRow]: updateSpreadsheetRow,
  [StepType.waitUserReply]: undefined,
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
  const nodes = flowVersion.nodes as unknown as FlowNode[]

  // Find start node with priority:
  // 1. If nodeId is provided, use that
  // 2. Otherwise, use startNodeId from FlowVersion
  // 3. Fallback to finding node with isStartNode flag
  let startNode: FlowNode | undefined

  if (props.data.nodeId) {
    startNode = nodes.find((n) => n.id === props.data.nodeId)
  }

  if (!startNode && flowVersion.startNodeId) {
    startNode = nodes.find((n) => n.id === flowVersion.startNodeId)
  }

  if (!startNode) {
    startNode = nodes.find((n) => n.data.isStartNode === true)
  }

  // Fallback: Use first node if start node not found
  // This handles cases where startNodeId is out of sync with actual nodes
  if (!startNode && nodes.length > 0) {
    startNode = nodes[0]
  }

  if (!startNode) {
    throw new SdkException("FlowVersion does not contain any nodes")
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
    const stepType = step.stepType as StepType
    const handler = flowStepHandlers[stepType]

    if (handler) {
      yield handler({
        conversation,
        flowVersionId,
        step,
      })
    }
  }
}
