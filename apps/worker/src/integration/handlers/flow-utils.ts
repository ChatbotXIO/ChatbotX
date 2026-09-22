import { logProviderError } from "@chatbotx.io/business/error-log"
import type {
  ContactInboxModel,
  ConversationModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import type {
  BaseStepSchema,
  ButtonStepProps,
  EdgeSchema,
  MetadataPayload,
  StepType,
} from "@chatbotx.io/flow-config"
import type { CommentAnchor, Variables } from "@chatbotx.io/sdk"
import type { ErrorLogProvider } from "@chatbotx.io/utils/error-log"
import {
  type BotResponseTrackingContext,
  ChatJobAction,
  type ChatJobSendFlowStep,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
  type NodeVisits,
} from "@chatbotx.io/worker-config"
import { waitForChatJobCompletion } from "../utils/message"

export type ExecuteMultipleStepsProps = {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowVersion: FlowVersionModel
  useLatestFlowVersion?: boolean
  targetType?: "node" | "button" | "step" | "quickReply"
  targetId?: string
  targetNodeId?: string
  ctx?: {
    variables: Variables
  }
  steps: BaseStepSchema[]
  trackingContext?: BotResponseTrackingContext
  metadata?: MetadataPayload
  quickReplies?: ButtonStepProps[]
  sendFrom?: "inbox"
  nodeVisits?: NodeVisits
  triggerMessageId?: string
  triggerMessageCreatedAt?: Date
  commentAnchor?: CommentAnchor
  appointmentId?: string
  flowExecutionKey?: string
}

export type ExecuteStepProps<T> = Omit<ExecuteMultipleStepsProps, "steps"> & {
  step: T
}

export type HeavyStepComputeProps<T> = Pick<
  ExecuteStepProps<T>,
  "conversation" | "contactInbox" | "metadata" | "step"
>

export type HeavyStepProps<T> = ExecuteStepProps<T> & {
  flowExecutionKey: string
}

/**
 * Does this step type produce an outgoing message the contact receives?
 *
 * Exhaustive over `StepType` on purpose: a new step cannot be added without
 * answering this here, or the file stops compiling. The previous hand-written
 * set was defined as "whatever is mapped to `sendFlowMessage`", which silently
 * excluded every step that sends from its own handler — `getUserData` was
 * missing for that reason, so a comment-triggered flow whose question came
 * first never claimed the one comment_id-anchored DM Meta grants per comment,
 * and a question after a `sendText` reached the channel with no anchor, so
 * `assertCommentPrivateReplyFollowUpDeliverable` never ran. Both failed
 * silently. Do not replace this with a derived list again.
 *
 * `true` here means the step both RECEIVES the run's `commentAnchor` and may
 * CLAIM it. A step that sends but cannot carry the anchor must stay `false` —
 * claiming without forwarding burns the comment's single anchored DM on a send
 * that never used it.
 *
 * A separate list, `CHANNEL_DELIVERABLE_STEP_TYPES` (`chat/handlers/
 * send-flow-step.ts`), decides which step payloads that handler can actually
 * hand to a channel. It is not derived from this one and is not exhaustive, so
 * a new step that sends its own payload needs an entry there too.
 */
export const STEP_PRODUCES_MESSAGE: Record<StepType, boolean> = {
  landingPage: false,

  // Channel (H_)
  chooseChannel: false,

  // Send Messages (S_)
  sendText: true,
  sendImage: true,
  sendMultipleImages: true,
  sendCard: true,
  sendCarousel: true,
  sendVideo: true,
  sendGif: true,
  sendMessengerOtn: false,
  sendAudio: true,
  sendFile: true,
  sendQuickReply: true,

  // Wait/Timing (W_)
  waitUserReply: false,
  setDebounce: false,
  wait: false,
  followUp: false,
  getUserData: true,
  typing: false,

  // Contact Operations (C_)
  addContactTag: false,
  removeContactTag: false,
  deleteContact: false,
  blockContact: false,
  addContactNotes: false,
  setCustomField: false,
  clearCustomField: false,
  cancelContactInput: false,
  // Sends a booking prompt from its own handler, but through
  // `sendChatMessage`, whose job type has no `commentAnchor` field — so it
  // cannot forward the anchor yet and must not claim it. Flip to true only
  // together with that plumbing.
  appointmentScheduling: false,
  // Sends its question from its own handler, but through
  // `sendChatMessage`, whose job type has no `commentAnchor` field — so it
  // cannot forward the anchor yet and must not claim it. Flip to true only
  // together with that plumbing.
  questionnaires: false,
  setUpCoupon: false,
  markCouponUsed: false,
  condition: false,

  // Inbox Operations (I_)
  disableBot: false,
  enableBot: false,
  assignConversation: false,
  autoAssignConversation: false,
  unassignConversation: false,
  followConversation: false,
  unfollowConversation: false,
  archiveConversation: false,
  unarchiveConversation: false,
  notifyAgent: false,

  // AI/OpenAI Operations (A_)
  aiGenerateText: false,
  aiGenerateTextAgent: false,
  aiAnalyzeImage: false,
  aiGenerateImage: false,
  aiEditImage: false,
  aiSpeechToText: false,
  aiTextToSpeech: false,
  aiExtractData: false,
  aiDeleteMessageHistory: false,

  // Email Operations (E_)
  markEmailVerified: false,
  optInEmail: false,
  optOutEmail: false,

  // Utilities/Tools (U_)
  getDataFromJson: false,
  formatDate: false,
  generateCode: false,
  countCharacters: false,
  performAction: false,
  callApi: false,
  executeJavascript: false,
  splitTraffic: false,
  make: false,
  triggerN8n: false,

  // Flow Operations (F_)
  startAnotherNode: false,
  startExternalFlow: false,
  startExternalNode: false,

  // External/Others (X_)
  openWebsite: false,
  addNotes: false,

  // Broadcast Operations (B_)
  subscribeBroadcast: false,
  unsubscribeBroadcast: false,

  // Google Sheets Operations (G_)
  spreadsheetSendData: false,
  spreadsheetGetRow: false,
  spreadsheetGetRandomRow: false,
  spreadsheetUpdateRow: false,
  spreadsheetClearRow: false,

  // Mail Marketing Operations (M_)
  activeCampaignSyncContact: false,
  getResponseAddContact: false,
  mailchimpAddMember: false,
  mailerLiteAddSubscriber: false,
  moosendCreateContact: false,
  dripSubscribeSubscriber: false,
  sendGridAddContact: false,
  klaviyoSyncProfile: false,

  // Sequence Operations (Q_)
  subscribeSequence: false,
  unsubscribeSequence: false,

  // Email
  email: false,

  // WhatsApp Template Message
  sendWaTemplateMessage: true,
  whatsappOptionList: true,
  whatsappCallButton: true,
  whatsappFlow: true,
  sendMessengerTemplateMessage: true,

  // Messenger Operations (N_)
  facebookCustomAudience: false,
  sendMetaCapiEvent: false,
  setMessengerUserPersistentMenu: false,
  enableMessengerComposer: false,
  disableMessengerComposer: false,
  setMessengerPersona: false,
  updateMessengerContactData: false,
}

/**
 * The `true` half of {@link STEP_PRODUCES_MESSAGE}, as a set — used to decide
 * which step claims a pending `commentAnchor` (comment-triggered private-reply
 * flow) as its first outgoing message.
 */
export const MESSAGE_PRODUCING_STEP_TYPES = new Set<StepType>(
  Object.entries(STEP_PRODUCES_MESSAGE)
    .filter(([, producesMessage]) => producesMessage)
    .map(([stepType]) => stepType as StepType),
)

export type SuccessErrorStepSchema = BaseStepSchema & {
  successNodeId?: string
  errorNodeId?: string
}

export const seekConnectedNode = (
  flowVersion: FlowVersionModel,
  sourceId: string,
) => {
  const connectedNode = (flowVersion.edges as EdgeSchema[]).find(
    (edge) => edge.sourceHandle === sourceId,
  )
  return connectedNode?.target
}

export async function sendFlow(
  props: ExecuteStepProps<SuccessErrorStepSchema>,
  isSuccess: boolean,
) {
  const { conversation, contactInbox, flowVersion, step } = props
  if (!flowVersion) {
    return
  }

  const nodeId: string | undefined = isSuccess
    ? step.successNodeId
    : step.errorNodeId

  if (!nodeId) {
    return
  }

  const connectedNodeId = seekConnectedNode(flowVersion, nodeId)

  if (connectedNodeId) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: flowVersion.flowId,
        nodeId: connectedNodeId,
        metadata: props.metadata,
        appointmentId: props.appointmentId,
        sendFrom: props.sendFrom,
        nodeVisits: props.nodeVisits,
        commentAnchor: props.commentAnchor,
        origin: webhookChannelOrigin(),
      },
    })
  }
}

/**
 * Enqueue a flow-step chat job and wait for completion to preserve the current
 * node's step ordering while using the analytics-aware flow send path.
 */
export async function enqueueFlowStepMessage(
  data: ChatJobSendFlowStep["data"],
): Promise<void> {
  const job = await chatQueue.add(ChatJobAction.sendFlowMessage, {
    type: ChatJobAction.sendFlowMessage,
    data,
  })

  await waitForChatJobCompletion(job, {
    conversationId: data.conversationId,
    stepId: data.step.id,
  })
}

/**
 * Record a third-party failure from inside a flow step's `catch`.
 *
 * Every single-provider step handler attributes a failure identically — the
 * workspace and contact off `conversation`, the contact's channel-side id off
 * `contactInbox`, both already on `ExecuteStepProps` — so the object was
 * hand-copied into a dozen catch blocks, and each new attribution column meant
 * editing all of them with no compiler help for the one that got missed.
 *
 * Takes the props slice rather than the two models so a call site passes the
 * `props` it already holds. `spreadsheet-handler.ts` keeps a thin local wrapper
 * over this because it also pins the provider across its five catch sites.
 */
export const logStepProviderError = (
  provider: ErrorLogProvider,
  props: {
    conversation: Pick<ConversationModel, "workspaceId" | "contactId">
    contactInbox: Pick<ContactInboxModel, "sourceId">
  },
  error: unknown,
): Promise<void> =>
  logProviderError({
    provider,
    workspaceId: props.conversation.workspaceId,
    contactId: props.conversation.contactId,
    sourceId: props.contactInbox.sourceId,
    error,
  })
