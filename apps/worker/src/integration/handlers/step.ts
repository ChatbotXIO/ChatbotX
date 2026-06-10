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
  subscribeBroadcast,
  unsubscribeBroadcast,
} from "./contact"
import { handleAIDeleteMessageHistory } from "./delete-message-history"
import { handleAIEditImage } from "./edit-image"
import { handleAIExtractData } from "./extract-data/index"
import { type ExecuteStepProps, seekConnectedNode } from "./flow-utils"
import { handleAIGenerateImage } from "./generate-image"
import { handleAIGenerateText } from "./generate-text"
import { handleAIGenerateTextAgent } from "./generate-text-agent"
import { getUserData } from "./get-user-data"
import { sendEmail } from "./send-email"
import { handleAISpeechToText } from "./speech-to-text"
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
import { handleAITextToSpeech } from "./text-to-speech"
import {
  countCharacters,
  formatDate,
  generateCode,
  getDataFromJSON,
} from "./tool-handler"

export async function sendFlowMessage(
  props: ExecuteStepProps<ChatJobSendFlowStep["data"]["step"]>,
) {
  const {
    conversation,
    flowVersion,
    step,
    trackingContext,
    metadata,
    sendFrom,
  } = props
  await chatQueue.add(ChatJobAction.sendFlowMessage, {
    type: ChatJobAction.sendFlowMessage,
    data: {
      conversationId: conversation.id,
      flowId: flowVersion.flowId,
      flowVersionId: flowVersion.id,
      step,
      trackingContext,
      metadata,
      sendFrom,
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
  sendFrom,
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
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        flowId: flowVersion.flowId,
        flowVersionId: useLatestFlowVersion ? undefined : flowVersion.id,
        nodeId: connectedEdge.target,
        sendFrom,
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
  sendFrom,
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
            sendFrom,
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
      conversationId: props.conversation.id,
      contactInboxId: props.contactInbox.id,
      flowId: props.flowVersion.flowId,
      flowVersionId: props.flowVersion.id,
      nodeId: props.step.nodeId,
      metadata: props.metadata,
      sendFrom: props.sendFrom,
    },
  })
}

async function startExternalFlow({
  conversation,
  contactInbox,
  step,
  metadata,
  sendFrom,
}: ExecuteStepProps<StartExternalFlowStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      flowId: step.flowId,
      metadata,
      sendFrom,
    },
  })
}

async function startExternalNode({
  conversation,
  contactInbox,
  step,
  metadata,
  sendFrom,
}: ExecuteStepProps<StartExternalNodeStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      flowId: step.flowId,
      nodeId: step.nodeId,
      metadata,
      sendFrom,
    },
  })
}

/** Triggers `step.states` routing to a connected node */
export type StepRoutingStatus = "success" | "error" | "skip"

/**
 * Stops the step execution loop without routing to another node.
 * - `wait`: resume at a scheduled future time via smart delay
 * - `retry`: resume when the user sends their next message (getUserData challenge)
 */
export type StepControlStatus = "wait" | "retry"

export type ExecuteStepStatus = StepRoutingStatus | StepControlStatus

export type ExecuteStepResult = {
  status: ExecuteStepStatus
  errorMessage?: string
  result: unknown
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
  [stepTypes.enum.aiDeleteMessageHistory]: handleAIDeleteMessageHistory,
  [stepTypes.enum.aiEditImage]: handleAIEditImage,
  [stepTypes.enum.aiGenerateImage]: handleAIGenerateImage,
  [stepTypes.enum.aiGenerateTextAgent]: handleAIGenerateTextAgent,
  [stepTypes.enum.aiGenerateText]: handleAIGenerateText,
  [stepTypes.enum.aiExtractData]: handleAIExtractData,
  [stepTypes.enum.aiSpeechToText]: handleAISpeechToText,
  [stepTypes.enum.aiTextToSpeech]: handleAITextToSpeech,
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
  [stepTypes.enum.subscribeBroadcast]: subscribeBroadcast,
  [stepTypes.enum.unsubscribeBroadcast]: unsubscribeBroadcast,
  [stepTypes.enum.splitTraffic]: splitTraffic,
  [stepTypes.enum.startAnotherNode]: startAnotherNode,
  [stepTypes.enum.startExternalNode]: startExternalNode,
  [stepTypes.enum.addNotes]: undefined,
  [stepTypes.enum.spreadsheetGetRow]: undefined,
  [stepTypes.enum.spreadsheetClearRow]: undefined,
  [stepTypes.enum.spreadsheetGetRandomRow]: undefined,
  [stepTypes.enum.spreadsheetSendData]: undefined,
  [stepTypes.enum.spreadsheetUpdateRow]: undefined,
  [stepTypes.enum.waitUserReply]: undefined,
  [stepTypes.enum.subscribeSequence]: addContactSequence,
  [stepTypes.enum.unsubscribeSequence]: removeContactSequence,
  [stepTypes.enum.sendQuickReply]: sendFlowMessage,
  [stepTypes.enum.email]: sendEmail,
  [stepTypes.enum.typing]: stepSendTyping,
  [stepTypes.enum.sendWaTemplateMessage]: sendFlowMessage,
  [stepTypes.enum.sendMessengerTemplateMessage]: sendFlowMessage,
  [stepTypes.enum.whatsappOptionList]: sendFlowMessage,
  [stepTypes.enum.whatsappFlow]: sendFlowMessage,
}
