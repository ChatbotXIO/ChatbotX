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
  clearContactCustomField,
  deleteContact,
  markEmailVerified,
  optInEmail,
  optOutEmail,
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
  const { conversation, flowVersion, step } = props
  await chatQueue.add(ChatJobAction.sendFlowMessage, {
    type: ChatJobAction.sendFlowMessage,
    data: {
      conversationId: conversation.id,
      flowId: flowVersion.flowId,
      flowVersionId: flowVersion.id,
      step,
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
    },
  })
}

async function startExternalFlow({
  conversation,
  step,
}: ExecuteStepProps<StartExternalFlowStepSchema>) {
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
}: ExecuteStepProps<StartExternalNodeStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      flowId: step.flowId,
      nodeId: step.nodeId,
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
  [StepType.addContactNotes]: addContactNotes,
  [StepType.addContactTag]: addContactTag,
  [StepType.archiveConversation]: stepArchiveConversation,
  [StepType.assignConversation]: stepAssignConversation,
  [StepType.autoAssignConversation]: stepAutoAssignConversation,
  [StepType.blockContact]: stepBlockContact,
  [StepType.callApi]: undefined,
  [StepType.cancelContactInput]: undefined,
  [StepType.clearCustomField]: clearContactCustomField,
  [StepType.countCharacters]: countCharacters,
  [StepType.deleteContact]: deleteContact,
  [StepType.disableBot]: stepDisableBot,
  [StepType.enableBot]: stepEnableBot,
  [StepType.followConversation]: stepFollowConversation,
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
  [StepType.aiGenerateText]: handleAIGenerateText,
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
  [StepType.unarchiveConversation]: stepUnarchiveConversation,
  [StepType.unassignConversation]: stepUnassignConversation,
  [StepType.unfollowConversation]: stepUnfollowConversation,
  [StepType.getUserData]: getUserData,
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
  [StepType.emailH3]: undefined,
  [StepType.emailText]: undefined,
  [StepType.emailImage]: undefined,
  [StepType.emailButton]: undefined,
  [StepType.emailLine]: undefined,
  [StepType.emailSpacing]: undefined,
  [StepType.emailCode]: undefined,
  [StepType.emailHeader]: undefined,
  [StepType.typing]: stepSendTyping,
}
