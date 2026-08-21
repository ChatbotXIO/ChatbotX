import { contactCustomFieldValueService } from "@chatbotx.io/business/contact-custom-field-value"
import { smartDelayTypes } from "@chatbotx.io/database/partials"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  computeTriggerAt,
  type EdgeSchema,
  type SplitTrafficStepSchema,
  type StartAnotherNodeStepSchema,
  type StartExternalFlowStepSchema,
  type StartExternalNodeStepSchema,
  type StepType,
  stepTypes,
  type WaitStepSchema,
} from "@chatbotx.io/flow-config"
import {
  type ChatJobSendFlowStep,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { syncActiveCampaignContact } from "./active-campaign-handler"
import { handleAIAnalyzeImage } from "./analyze-image"
import { appointmentScheduling } from "./appointment-scheduling"
import { handleCondition } from "./condition"
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
import { markCouponUsed, setUpCoupon } from "./coupon"
import { handleAIDeleteMessageHistory } from "./delete-message-history"
import { subscribeDripSubscriber } from "./drip-handler"
import { handleAIEditImage } from "./edit-image"
import { handleAIExtractData } from "./extract-data/index"
import { handleFacebookCustomAudience } from "./facebook-custom-audience-handler"
import {
  type ExecuteStepProps,
  enqueueFlowStepMessage,
  seekConnectedNode,
} from "./flow-utils"
import { handleFollowUp } from "./follow-up"
import { handleAIGenerateImage } from "./generate-image"
import { handleAIGenerateText } from "./generate-text"
import { handleAIGenerateTextAgent } from "./generate-text-agent"
import { addGetResponseContact } from "./get-response-handler"
import { getUserData } from "./get-user-data"
import { syncKlaviyoProfile } from "./klaviyo-handler"
import { addMailchimpMember } from "./mailchimp-handler"
import { addMailerLiteSubscriber } from "./mailer-lite-handler"
import { handleMakeStep } from "./make-handler"
import { updateMessengerContactData } from "./messenger-contact-data"
import {
  disableMessengerComposer,
  enableMessengerComposer,
  setMessengerPersona,
  setMessengerUserPersistentMenu,
} from "./messenger-user-menu"
import { handleSendMetaCapiEventStep } from "./meta-conversions/send-meta-capi-event-step-handler"
import { addOrUpdateMoosendContact } from "./moosend-handler"
import { questionnaires } from "./questionnaires"
import { sendEmail } from "./send-email"
import { addSendGridContact } from "./sendgrid-handler"
import { scheduleSmartDelayResume } from "./smart-delay"
import { handleAISpeechToText } from "./speech-to-text"

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
import { handleAITextToSpeech } from "./text-to-speech"
import {
  countCharacters,
  externalRequest,
  formatDate,
  generateCode,
  getDataFromJSON,
  handleExecuteJavascript,
} from "./tool-handler"
import { handleTriggerN8nStep } from "./trigger-n8n-handler"

export async function sendFlowMessage(
  props: ExecuteStepProps<ChatJobSendFlowStep["data"]["step"]>,
) {
  const {
    conversation,
    flowVersion,
    useLatestFlowVersion,
    step,
    trackingContext,
    metadata,
    quickReplies,
    sendFrom,
    commentAnchor,
    appointmentId,
  } = props
  await enqueueFlowStepMessage({
    conversationId: conversation.id,
    contactInboxId: props.contactInbox.id,
    flowId: flowVersion.flowId,
    flowVersionId: useLatestFlowVersion ? undefined : flowVersion.id,
    executedFlowVersionId: flowVersion.id,
    step,
    trackingContext,
    metadata,
    quickReplies,
    sendFrom,
    commentAnchor,
    appointmentId,
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
  nodeVisits,
  commentAnchor,
  appointmentId,
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
        nodeVisits,
        commentAnchor,
        appointmentId,
        origin: webhookChannelOrigin(),
      },
    })
  }
}

// Known gap: `commentAnchor` (comment-triggered public/private-reply flows,
// see `flow-utils.ts`) is not threaded into `scheduleSmartDelayResume` —
// `ContactOnSmartDelay` has no column for it, and the resumed `sendFlow` job
// is rebuilt from that DB row alone (`buildSendFlowResumeJob`). A public or
// private reply flow with a "wait" step before its first message step loses
// the anchor: private falls back to the normal (messaging-window-gated) DM
// send, public falls back to a normal flow DM instead of a comment reply.
// Fixing this needs a schema change; out of scope for now.
async function handleWait({
  conversation,
  flowVersion,
  contactInbox,
  targetId,
  step,
  useLatestFlowVersion,
  metadata,
  sendFrom,
  appointmentId,
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
      return await contactCustomFieldValueService.findValue({
        contactId: contactInbox.contactId,
        customFieldId,
      })
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

  if (!connectedNodeId) {
    return { status: "skip", result: null }
  }

  await scheduleSmartDelayResume({
    type: smartDelayTypes.enum.waitNode,
    triggerAt,
    workspaceId: conversation.workspaceId,
    flowId: flowVersion.flowId,
    flowVersionId: useLatestFlowVersion ? null : flowVersion.id,
    conversationId: conversation.id,
    contactInboxId,
    connectedNodeId,
    stepId: step.id,
    metadata,
    sendFrom,
    appointmentId,
  })

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
      appointmentId: props.appointmentId,
      sendFrom: props.sendFrom,
      nodeVisits: props.nodeVisits,
      commentAnchor: props.commentAnchor,
      origin: webhookChannelOrigin(),
    },
  })
}

async function startExternalFlow({
  conversation,
  contactInbox,
  step,
  metadata,
  sendFrom,
  nodeVisits,
  commentAnchor,
  appointmentId,
}: ExecuteStepProps<StartExternalFlowStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      flowId: step.flowId,
      metadata,
      appointmentId,
      sendFrom,
      nodeVisits,
      commentAnchor,
      origin: webhookChannelOrigin(),
    },
  })
}

async function startExternalNode({
  conversation,
  contactInbox,
  step,
  metadata,
  sendFrom,
  nodeVisits,
  commentAnchor,
  appointmentId,
}: ExecuteStepProps<StartExternalNodeStepSchema>) {
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      flowId: step.flowId,
      nodeId: step.nodeId,
      metadata,
      appointmentId,
      sendFrom,
      nodeVisits,
      commentAnchor,
      origin: webhookChannelOrigin(),
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
  [stepTypes.enum.callApi]: externalRequest,
  [stepTypes.enum.make]: handleMakeStep,
  [stepTypes.enum.triggerN8n]: handleTriggerN8nStep,
  [stepTypes.enum.executeJavascript]: handleExecuteJavascript,
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
  [stepTypes.enum.activeCampaignSyncContact]: syncActiveCampaignContact,
  [stepTypes.enum.facebookCustomAudience]: handleFacebookCustomAudience,
  [stepTypes.enum.sendMetaCapiEvent]: handleSendMetaCapiEventStep,
  [stepTypes.enum.getResponseAddContact]: addGetResponseContact,
  [stepTypes.enum.dripSubscribeSubscriber]: subscribeDripSubscriber,
  [stepTypes.enum.mailchimpAddMember]: addMailchimpMember,
  [stepTypes.enum.mailerLiteAddSubscriber]: addMailerLiteSubscriber,
  [stepTypes.enum.klaviyoSyncProfile]: syncKlaviyoProfile,
  [stepTypes.enum.moosendCreateContact]: addOrUpdateMoosendContact,
  [stepTypes.enum.sendGridAddContact]: addSendGridContact,
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
  [stepTypes.enum.followUp]: handleFollowUp,
  [stepTypes.enum.startExternalFlow]: startExternalFlow,
  [stepTypes.enum.chooseChannel]: undefined,
  [stepTypes.enum.appointmentScheduling]: appointmentScheduling,
  [stepTypes.enum.questionnaires]: questionnaires,
  [stepTypes.enum.setUpCoupon]: setUpCoupon,
  [stepTypes.enum.markCouponUsed]: markCouponUsed,
  [stepTypes.enum.condition]: handleCondition,
  [stepTypes.enum.subscribeBroadcast]: subscribeBroadcast,
  [stepTypes.enum.unsubscribeBroadcast]: unsubscribeBroadcast,
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
  [stepTypes.enum.sendMessengerTemplateMessage]: sendFlowMessage,
  [stepTypes.enum.whatsappOptionList]: sendFlowMessage,
  [stepTypes.enum.whatsappFlow]: sendFlowMessage,
  [stepTypes.enum.setMessengerUserPersistentMenu]:
    setMessengerUserPersistentMenu,
  [stepTypes.enum.enableMessengerComposer]: enableMessengerComposer,
  [stepTypes.enum.disableMessengerComposer]: disableMessengerComposer,
  [stepTypes.enum.setMessengerPersona]: setMessengerPersona,
  [stepTypes.enum.updateMessengerContactData]: updateMessengerContactData,
}
