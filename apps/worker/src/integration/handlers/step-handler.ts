import type { ConversationModel } from "@aha.chat/database/types"
import {
  type StartAnotherNodeStepSchema,
  type StartExternalFlowStepSchema,
  type StartExternalNodeStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import {
  ChatJobAction,
  type ChatJobSendFlowStep,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@aha.chat/worker-config"
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
import {
  clearSpreadsheetRow,
  getSpreadsheetRandomRow,
  getSpreadsheetRow,
  sendSpreadsheetData,
  updateSpreadsheetRow,
} from "./spreadsheet-handler"
import {
  countCharacters,
  formatDate,
  generateCode,
  getDataFromJSON,
} from "./tool-handler"

export type FlowStepProps<T> = {
  conversation: ConversationModel
  flowId: string
  flowVersionId?: string
  step: T
}

export async function sendFlowMessage(
  props: FlowStepProps<ChatJobSendFlowStep["data"]["step"]>,
) {
  const { conversation, flowId, flowVersionId, step } = props
  await chatQueue.add(ChatJobAction.sendFlowMessage, {
    type: ChatJobAction.sendFlowMessage,
    data: {
      conversationId: conversation.id,
      flowId,
      flowVersionId,
      step,
    },
  })
}

async function startAnotherNode({
  conversation,
  flowId,
  flowVersionId,
  step,
}: FlowStepProps<StartAnotherNodeStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      flowId,
      flowVersionId,
      nodeId: step.nodeId,
    },
  })
}

async function startExternalFlow({
  conversation,
  step,
}: FlowStepProps<StartExternalFlowStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      flowId: step.flowId,
    },
  })
}

async function startExternalNode({
  conversation,
  step,
}: FlowStepProps<StartExternalNodeStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      flowId: step.flowId,
      nodeId: step.nodeId,
    },
  })
}

export const flowStepHandlers: Record<
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
  [StepType.sendAudio]: sendFlowMessage,
  [StepType.sendCard]: sendFlowMessage,
  [StepType.sendCarousel]: sendFlowMessage,
  [StepType.sendFile]: sendFlowMessage,
  [StepType.sendGif]: sendFlowMessage,
  [StepType.sendImage]: sendFlowMessage,
  [StepType.sendMessengerOtn]: undefined,
  [StepType.sendText]: sendFlowMessage,
  [StepType.sendVideo]: sendFlowMessage,
  [StepType.setCustomField]: setContactCustomField,
  [StepType.setDebounce]: undefined,
  [StepType.unarchiveConversation]: unarchiveConversation,
  [StepType.unassignConversation]: unassignConversation,
  [StepType.unfollowConversation]: unfollowConversation,
  [StepType.getUserInput]: undefined,
  [StepType.wait]: undefined,
  [StepType.startExternalFlow]: startExternalFlow,
  [StepType.chooseChannel]: undefined,
  [StepType.filterContact]: undefined,
  [StepType.subscribeBroadcast]: undefined,
  [StepType.unsubscribeBroadcast]: undefined,
  [StepType.splitTraffic]: undefined,
  [StepType.startAnotherNode]: startAnotherNode,
  [StepType.startExternalNode]: startExternalNode,
  [StepType.addNotes]: undefined,
  [StepType.spreadsheetGetRow]: getSpreadsheetRow,
  [StepType.spreadsheetClearRow]: clearSpreadsheetRow,
  [StepType.spreadsheetGetRandomRow]: getSpreadsheetRandomRow,
  [StepType.spreadsheetSendData]: sendSpreadsheetData,
  [StepType.spreadsheetUpdateRow]: updateSpreadsheetRow,
  [StepType.waitUserReply]: undefined,
  [StepType.sendQuickReply]: sendFlowMessage,
}
