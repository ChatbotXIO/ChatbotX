import {
  type StartAnotherNodeStepSchema,
  type StartExternalFlowStepSchema,
  type StartExternalNodeStepSchema,
  type StepType,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  ChatJobAction,
  type ChatJobSendFlowStep,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import {
  addContactNotes,
  addContactSequence,
  addContactTag,
  clearContactCustomField,
  deleteContact,
  markEmailVerified,
  optInEmail,
  optOutEmail,
  removeContactSequence,
  removeContactTag,
  setContactCustomField,
} from "./contact"
import type { ExecuteStepProps } from "./flow"
import { handleAIGenerateText } from "./generate-text"
import { getUserData } from "./get-user-data"
import {
  clearSpreadsheetRow,
  getSpreadsheetRandomRow,
  getSpreadsheetRow,
  sendSpreadsheetData,
  updateSpreadsheetRow,
} from "./spreadsheet-handler"
import {
  stepArchiveConversation,
  stepAssignConversation,
  stepAutoAssignConversation,
  stepBlockContact,
  stepDisableBot,
  stepEnableBot,
  stepFollowConversation,
  stepSendTyping,
  stepUnarchiveConversation,
  stepUnassignConversation,
  stepUnfollowConversation,
} from "./step-handlers"
import {
  countCharacters,
  formatDate,
  generateCode,
  getDataFromJSON,
} from "./tool-handler"

export async function sendFlowMessage(
  props: ExecuteStepProps<ChatJobSendFlowStep["data"]["step"]>,
) {
  const { conversation, flowVersion, step, trackingContext, metadata } = props
  await chatQueue.add(ChatJobAction.sendFlowMessage, {
    type: ChatJobAction.sendFlowMessage,
    data: {
      conversationId: conversation.id,
      flowId: flowVersion.flowId,
      flowVersionId: flowVersion.id,
      step,
      trackingContext,
      metadata,
    },
  })
}

async function startAnotherNode(
  props: ExecuteStepProps<StartAnotherNodeStepSchema>,
) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: props.conversation.id,
      flowId: props.flowVersion.flowId,
      flowVersionId: props.flowVersion.id,
      nodeId: props.step.nodeId,
      metadata: props.metadata,
    },
  })
}

async function startExternalFlow({
  conversation,
  step,
  metadata,
}: ExecuteStepProps<StartExternalFlowStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      flowId: step.flowId,
      metadata,
    },
  })
}

async function startExternalNode({
  conversation,
  step,
  metadata,
}: ExecuteStepProps<StartExternalNodeStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      flowId: step.flowId,
      nodeId: step.nodeId,
      metadata,
    },
  })
}

export type ExecuteStepResult = {
  status: "success" | "skip" | "error" | "retry" | "wait"
  errorMessage?: string
  // biome-ignore lint/suspicious/noExplicitAny: safe ignore
  result: any
}

export const flowStepHandlers: Record<
  StepType,
  | ((
      // biome-ignore lint/suspicious/noExplicitAny: safe to use any
      props: ExecuteStepProps<any>,
    ) => Promise<ExecuteStepResult> | Promise<void>)
  | undefined
> = {
  [stepTypes.enum.addContactNotes]: addContactNotes,
  [stepTypes.enum.addContactTag]: addContactTag,
  [stepTypes.enum.archiveConversation]: stepArchiveConversation,
  [stepTypes.enum.assignConversation]: stepAssignConversation,
  [stepTypes.enum.autoAssignConversation]: stepAutoAssignConversation,
  [stepTypes.enum.blockContact]: stepBlockContact,
  [stepTypes.enum.callApi]: undefined,
  [stepTypes.enum.cancelContactInput]: undefined,
  [stepTypes.enum.clearCustomField]: clearContactCustomField,
  [stepTypes.enum.countCharacters]: countCharacters,
  [stepTypes.enum.deleteContact]: deleteContact,
  [stepTypes.enum.disableBot]: stepDisableBot,
  [stepTypes.enum.enableBot]: stepEnableBot,
  [stepTypes.enum.followConversation]: stepFollowConversation,
  [stepTypes.enum.formatDate]: formatDate,
  [stepTypes.enum.generateCode]: generateCode,
  [stepTypes.enum.getDataFromJson]: getDataFromJSON,
  [stepTypes.enum.landingPage]: undefined,
  [stepTypes.enum.markEmailVerified]: markEmailVerified,
  [stepTypes.enum.notifyAgent]: undefined,
  [stepTypes.enum.openWebsite]: undefined,
  [stepTypes.enum.aiAnalyzeImage]: undefined,
  [stepTypes.enum.aiDeleteMessageHistory]: undefined,
  [stepTypes.enum.aiGenerateImage]: undefined,
  [stepTypes.enum.aiGenerateTextAgent]: undefined,
  [stepTypes.enum.aiGenerateText]: handleAIGenerateText,
  [stepTypes.enum.aiSpeechToText]: undefined,
  [stepTypes.enum.aiTextToSpeech]: undefined,
  [stepTypes.enum.optInEmail]: optInEmail,
  [stepTypes.enum.optOutEmail]: optOutEmail,
  [stepTypes.enum.performAction]: undefined,
  [stepTypes.enum.removeContactTag]: removeContactTag,
  [stepTypes.enum.sendAudio]: sendFlowMessage,
  [stepTypes.enum.sendCard]: sendFlowMessage,
  [stepTypes.enum.sendCarousel]: sendFlowMessage,
  [stepTypes.enum.sendFile]: sendFlowMessage,
  [stepTypes.enum.sendGif]: sendFlowMessage,
  [stepTypes.enum.sendImage]: sendFlowMessage,
  [stepTypes.enum.sendMessengerOtn]: undefined,
  [stepTypes.enum.sendText]: sendFlowMessage,
  [stepTypes.enum.sendVideo]: sendFlowMessage,
  [stepTypes.enum.setCustomField]: setContactCustomField,
  [stepTypes.enum.setDebounce]: undefined,
  [stepTypes.enum.unarchiveConversation]: stepUnarchiveConversation,
  [stepTypes.enum.unassignConversation]: stepUnassignConversation,
  [stepTypes.enum.unfollowConversation]: stepUnfollowConversation,
  [stepTypes.enum.getUserData]: getUserData,
  [stepTypes.enum.wait]: undefined,
  [stepTypes.enum.startExternalFlow]: startExternalFlow,
  [stepTypes.enum.chooseChannel]: undefined,
  [stepTypes.enum.filterContact]: undefined,
  [stepTypes.enum.subscribeBroadcast]: undefined,
  [stepTypes.enum.unsubscribeBroadcast]: undefined,
  [stepTypes.enum.splitTraffic]: undefined,
  [stepTypes.enum.startAnotherNode]: startAnotherNode,
  [stepTypes.enum.startExternalNode]: startExternalNode,
  [stepTypes.enum.addNotes]: undefined,
  [stepTypes.enum.spreadsheetGetRow]: getSpreadsheetRow,
  [stepTypes.enum.spreadsheetClearRow]: clearSpreadsheetRow,
  [stepTypes.enum.spreadsheetGetRandomRow]: getSpreadsheetRandomRow,
  [stepTypes.enum.spreadsheetSendData]: sendSpreadsheetData,
  [stepTypes.enum.spreadsheetUpdateRow]: updateSpreadsheetRow,
  [stepTypes.enum.waitUserReply]: undefined,
  [stepTypes.enum.subscribeSequence]: addContactSequence,
  [stepTypes.enum.unsubscribeSequence]: removeContactSequence,
  [stepTypes.enum.sendQuickReply]: sendFlowMessage,
  [stepTypes.enum.emailH3]: undefined,
  [stepTypes.enum.emailText]: undefined,
  [stepTypes.enum.emailImage]: undefined,
  [stepTypes.enum.emailButton]: undefined,
  [stepTypes.enum.emailLine]: undefined,
  [stepTypes.enum.emailSpacing]: undefined,
  [stepTypes.enum.emailCode]: undefined,
  [stepTypes.enum.emailHeader]: undefined,
  [stepTypes.enum.typing]: stepSendTyping,
  [stepTypes.enum.sendWaTemplateMessage]: sendFlowMessage,
}
