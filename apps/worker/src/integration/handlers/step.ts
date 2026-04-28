import { db, eq } from "@chatbotx.io/database/client"
import {
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import { contactOnSmartDelayModel } from "@chatbotx.io/database/schema"
import {
  buildJobId,
  computeTriggerAt,
  type EdgeSchema,
  ENQUEUE_DELAY_MS,
  type SplitTrafficStepSchema,
  type StartAnotherNodeStepSchema,
  type StartExternalFlowStepSchema,
  type StartExternalNodeStepSchema,
  type StepType,
  stepTypes,
  type WaitStepSchema,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  type ChatJobSendFlowStep,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { handleAIAnalyzeImage } from "./analyze-image"
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
import { handleAIExtractData } from "./extract-data/index"
import { type ExecuteStepProps, seekConnectedNode } from "./flow"
import { handleAIGenerateImage } from "./generate-image"
import { handleAIGenerateText } from "./generate-text"
import { handleAIGenerateTextAgent } from "./generate-text-agent"
import { getUserData } from "./get-user-data"
import { sendEmail } from "./send-email"
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

async function splitTraffic({
  conversation,
  contactInbox,
  flowVersion,
  step,
  targetId,
  useLatestFlowVersion,
}: ExecuteStepProps<SplitTrafficStepSchema>) {
  if (!(targetId && step.cases.length)) {
    return
  }

  const total = step.cases.reduce((sum, c) => sum + c.value, 0)
  const bucket = Math.random() * total
  let cumulative = 0
  let selectedIndex = 0
  for (let i = 0; i < step.cases.length; i++) {
    cumulative += step.cases[i].value
    if (bucket < cumulative) {
      selectedIndex = i
      break
    }
  }

  const sourceHandle = `${targetId}-case-${selectedIndex}`
  const edges = (flowVersion.edges as EdgeSchema[]) ?? []
  const connectedEdge = edges.find((edge) => edge.sourceHandle === sourceHandle)

  if (connectedEdge?.target) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: flowVersion.flowId,
        flowVersionId: useLatestFlowVersion ? undefined : flowVersion.id,
        nodeId: connectedEdge.target,
      },
    })
  }
}

async function handleWait({
  conversation,
  flowVersion,
  contactInbox,
  targetId,
  step,
  useLatestFlowVersion,
}: ExecuteStepProps<WaitStepSchema>): Promise<ExecuteStepResult> {
  if (!(targetId && step)) {
    return { status: "skip", result: null }
  }

  if (!contactInbox) {
    return { status: "skip", result: null }
  }

  const contactInboxId = contactInbox.id

  const triggerAt = await computeTriggerAt(step, async (customFieldId) => {
    try {
      const customField = await db.query.contactCustomFieldModel.findFirst({
        where: {
          contactId: contactInbox.contactId,
          customFieldId,
        },
        columns: {
          value: true,
        },
      })
      return customField?.value ?? null
    } catch (err) {
      logger.error(
        { err, customFieldId },
        "Failed to query custom field for wait step",
      )
      return null
    }
  })

  if (!triggerAt) {
    return {
      status: "error",
      errorMessage: "Unable to compute wait triggerAt",
      result: null,
    }
  }

  const connectedNodeId = seekConnectedNode(flowVersion, targetId)
  const diffMs = triggerAt.getTime() - Date.now()

  if (!connectedNodeId) {
    return { status: "skip", result: null }
  }

  const rowId = createId()
  const data: typeof contactOnSmartDelayModel.$inferInsert = {
    id: rowId,
    workspaceId: conversation.workspaceId,
    flowId: flowVersion.flowId,
    flowVersionId: useLatestFlowVersion ? null : flowVersion.id,
    contactInboxId,
    conversationId: conversation.id,
    nodeId: connectedNodeId,
    stepId: step.id,
    type: smartDelayTypes.enum.waitNode,
    triggerAt,
    status: smartDelayStatuses.enum.pending,
  }

  // Insert tracking record first so a crash during enqueue still has a recovery path via scanner
  await db.insert(contactOnSmartDelayModel).values(data)

  if (diffMs <= ENQUEUE_DELAY_MS) {
    try {
      await integrationQueue.add(
        IntegrationJobAction.sendFlow,
        {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: conversation.id,
            flowId: flowVersion.flowId,
            flowVersionId: useLatestFlowVersion ? undefined : flowVersion.id,
            nodeId: connectedNodeId,
            contactInboxId,
          },
        },
        { delay: Math.max(0, diffMs), jobId: buildJobId(rowId) },
      )
      await db
        .update(contactOnSmartDelayModel)
        .set({ status: smartDelayStatuses.enum.completed })
        .where(eq(contactOnSmartDelayModel.id, rowId))
    } catch (err) {
      logger.warn(
        { err, rowId },
        "Failed to immediately enqueue smart delay; scanner will pick it up",
      )
    }
  }

  return { status: "wait", result: null }
}

async function startAnotherNode(
  props: ExecuteStepProps<StartAnotherNodeStepSchema>,
) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: props.conversation,
      contactInboxId: props.contactInbox,
      flowId: props.flowVersion.flowId,
      flowVersionId: props.flowVersion.id,
      nodeId: props.step.nodeId,
      metadata: props.metadata,
    },
  })
}

async function startExternalFlow({
  conversation,
  contactInbox,
  step,
  metadata,
}: ExecuteStepProps<StartExternalFlowStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation,
      contactInboxId: contactInbox,
      flowId: step.flowId,
      metadata,
    },
  })
}

async function startExternalNode({
  conversation,
  contactInbox,
  step,
  metadata,
}: ExecuteStepProps<StartExternalNodeStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation,
      contactInboxId: contactInbox,
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
  [stepTypes.enum.aiAnalyzeImage]: handleAIAnalyzeImage,
  [stepTypes.enum.aiDeleteMessageHistory]: undefined,
  [stepTypes.enum.aiGenerateImage]: handleAIGenerateImage,
  [stepTypes.enum.aiGenerateTextAgent]: handleAIGenerateTextAgent,
  [stepTypes.enum.aiGenerateText]: handleAIGenerateText,
  [stepTypes.enum.aiExtractData]: handleAIExtractData,
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
  [stepTypes.enum.wait]: handleWait,
  [stepTypes.enum.startExternalFlow]: startExternalFlow,
  [stepTypes.enum.chooseChannel]: undefined,
  [stepTypes.enum.filterContact]: undefined,
  [stepTypes.enum.subscribeBroadcast]: undefined,
  [stepTypes.enum.unsubscribeBroadcast]: undefined,
  [stepTypes.enum.splitTraffic]: splitTraffic,
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
  [stepTypes.enum.email]: sendEmail,
  [stepTypes.enum.typing]: stepSendTyping,
  [stepTypes.enum.sendWaTemplateMessage]: sendFlowMessage,
  [stepTypes.enum.whatsappOptionList]: sendFlowMessage,
}
