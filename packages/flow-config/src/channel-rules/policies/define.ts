import type { ChannelType } from "@chatbotx.io/utils/channel"
import type { ButtonStyle, ButtonType } from "../../steps/button"
import { type StepType, stepTypes } from "../../steps/step-action"
import type { ProductMessageCapability } from "../product-message-rules"

export const CHANNEL_POLICY_VERSION = 4

export const stepSupport = {
  full: "full",
  noButtons: "noButtons",
  unsupported: "unsupported",
} as const

export type StepSupport = (typeof stepSupport)[keyof typeof stepSupport]

type StepExecutionKind = "channel" | "worker"

const stepExecutionKinds = {
  landingPage: "worker",
  chooseChannel: "worker",
  sendText: "channel",
  sendImage: "channel",
  sendMultipleImages: "channel",
  sendCard: "channel",
  sendCarousel: "channel",
  sendVideo: "channel",
  sendGif: "channel",
  sendMessengerOtn: "worker",
  sendAudio: "channel",
  sendFile: "channel",
  sendQuickReply: "channel",
  waitUserReply: "worker",
  setDebounce: "worker",
  wait: "worker",
  followUp: "worker",
  getUserData: "worker",
  typing: "worker",
  addContactTag: "worker",
  removeContactTag: "worker",
  deleteContact: "worker",
  blockContact: "worker",
  addContactNotes: "worker",
  setCustomField: "worker",
  clearCustomField: "worker",
  cancelContactInput: "worker",
  appointmentScheduling: "worker",
  questionnaires: "worker",
  setUpCoupon: "worker",
  markCouponUsed: "worker",
  condition: "worker",
  evaluateDecision: "worker",
  disableBot: "worker",
  enableBot: "worker",
  assignConversation: "worker",
  autoAssignConversation: "worker",
  unassignConversation: "worker",
  markConversationAsUnread: "worker",
  markConversationAsRead: "worker",
  followConversation: "worker",
  unfollowConversation: "worker",
  archiveConversation: "worker",
  unarchiveConversation: "worker",
  threadControl: "worker",
  notifyAgent: "worker",
  aiGenerateText: "worker",
  aiGenerateTextAgent: "worker",
  aiAnalyzeImage: "worker",
  aiGenerateImage: "worker",
  aiEditImage: "worker",
  aiSegmentImage: "worker",
  aiSpeechToText: "worker",
  aiTextToSpeech: "worker",
  aiExtractData: "worker",
  aiDeleteMessageHistory: "worker",
  markEmailVerified: "worker",
  optInEmail: "worker",
  optOutEmail: "worker",
  getDataFromJson: "worker",
  formatDate: "worker",
  generateCode: "worker",
  findPlacesNearMe: "worker",
  countCharacters: "worker",
  performAction: "worker",
  callApi: "worker",
  executeJavascript: "worker",
  splitTraffic: "worker",
  make: "worker",
  triggerN8n: "worker",
  startAnotherNode: "worker",
  startExternalFlow: "worker",
  startExternalNode: "worker",
  openWebsite: "worker",
  openMiniApp: "worker",
  callPhoneNumber: "worker",
  copyText: "worker",
  addNotes: "worker",
  subscribeBroadcast: "worker",
  unsubscribeBroadcast: "worker",
  spreadsheetSendData: "worker",
  spreadsheetGetRow: "worker",
  spreadsheetGetRandomRow: "worker",
  spreadsheetUpdateRow: "worker",
  spreadsheetClearRow: "worker",
  activeCampaignSyncContact: "worker",
  getResponseAddContact: "worker",
  mailchimpAddMember: "worker",
  mailerLiteAddSubscriber: "worker",
  moosendCreateContact: "worker",
  dripSubscribeSubscriber: "worker",
  sendGridAddContact: "worker",
  klaviyoSyncProfile: "worker",
  subscribeSequence: "worker",
  changeGamificationScore: "worker",
  pipeline: "worker",
  unsubscribeSequence: "worker",
  email: "worker",
  sendViewCatalog: "channel",
  sendWaTemplateMessage: "channel",
  whatsappOptionList: "channel",
  whatsappCallButton: "channel",
  whatsappFlow: "channel",
  sendProducts: "channel",
  sendCollection: "channel",
  whatsappLocation: "channel",
  sendMessengerTemplateMessage: "channel",
  facebookCustomAudience: "worker",
  sendMetaCapiEvent: "worker",
  sendGoogleAdsConversion: "worker",
  setMessengerUserPersistentMenu: "worker",
  enableMessengerComposer: "worker",
  disableMessengerComposer: "worker",
  setMessengerPersona: "worker",
  updateMessengerContactData: "worker",
} as const satisfies Record<StepType, StepExecutionKind>

export const channelDeliverableStepTypes = [
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendCard,
  stepTypes.enum.sendCarousel,
  stepTypes.enum.sendCollection,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendGif,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendMessengerTemplateMessage,
  stepTypes.enum.sendMultipleImages,
  stepTypes.enum.sendProducts,
  stepTypes.enum.sendQuickReply,
  stepTypes.enum.sendText,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendViewCatalog,
  stepTypes.enum.sendWaTemplateMessage,
  stepTypes.enum.whatsappCallButton,
  stepTypes.enum.whatsappFlow,
  stepTypes.enum.whatsappLocation,
  stepTypes.enum.whatsappOptionList,
] as const satisfies readonly StepType[]

export type ChannelDeliverableStepType =
  (typeof channelDeliverableStepTypes)[number]

/**
 * Steps a channel has to declare support for itself: omnichannel is a
 * lowest-common-denominator authoring surface, so it must not inherit them
 * from `channelDeliverableStepTypes`.
 */
const channelOptInStepTypes: readonly ChannelDeliverableStepType[] = [
  stepTypes.enum.sendProducts,
  stepTypes.enum.sendCollection,
]

export const omnichannelDeliverableStepTypes: readonly ChannelDeliverableStepType[] =
  channelDeliverableStepTypes.filter(
    (stepType) => !channelOptInStepTypes.includes(stepType),
  )

/**
 * The button styles a channel renders (see `buttonStyles` in
 * `steps/button.ts`) and the one it uses for a button whose author chose none.
 */
export type ButtonStyleSupport = {
  options: readonly ButtonStyle[]
  default: ButtonStyle
}

export type ChannelFlowPolicy = {
  limits: {
    /**
     * Buttons on one step that is not a card: `sendText` (counting quick
     * replies when `quickRepliesShareButtonSlots`) and media steps.
     */
    buttonCount: number
    /**
     * Buttons on one card: a `sendCard` step and each card of a
     * `sendCarousel`. Required on every channel (even one without cards) so a
     * new channel cannot inherit another's number; it may not exceed
     * `CARD_BUTTON_MAX` (`steps/button-limits.ts`), the card schema's ceiling.
     */
    cardButtonCount: number
    buttonLabel: number
    cardTitle?: number
    text: number
    /** Declared only by channels that can deliver `sendViewCatalog`. */
    viewCatalog?: { footer: number; text: number }
  }
  quickRepliesShareButtonSlots: boolean
  /**
   * Button types the channel renders as a native control on step and card
   * buttons: `callPhoneNumber` (dials on tap) and `copyText` (copies on tap). A
   * channel that does not list one sends that button as a reply, and a tap
   * answers with the number or text. Informational: it never gates publish.
   */
  nativeButtonTypes: readonly ButtonType[]
  /**
   * The button styles the channel renders on step and card buttons, or `null`
   * when it has none (a button's `style` is then ignored). The builder shows
   * its style picker only when this is set. Informational: a stored style
   * never gates publish on any channel.
   */
  buttonStyles: ButtonStyleSupport | null
  steps: Record<StepType, StepSupport>
  /** Present only on channels that can render `sendProducts`. */
  productMessages?: ProductMessageCapability
}

type ChannelFlowPolicyDefinition = {
  limits: ChannelFlowPolicy["limits"]
  quickRepliesShareButtonSlots?: boolean
  nativeButtonTypes?: readonly ButtonType[]
  buttonStyles?: ButtonStyleSupport
  productMessages?: ProductMessageCapability
  supported?: readonly ChannelDeliverableStepType[]
  noButtons?: readonly ChannelDeliverableStepType[]
}

const createDefaultStepSupport = (): Record<StepType, StepSupport> =>
  Object.fromEntries(
    stepTypes.options.map((stepType) => [
      stepType,
      stepExecutionKinds[stepType] === "channel"
        ? stepSupport.unsupported
        : stepSupport.full,
    ]),
  ) as Record<StepType, StepSupport>

export const defineChannelFlowPolicy = (
  definition: ChannelFlowPolicyDefinition,
): ChannelFlowPolicy => {
  const steps = createDefaultStepSupport()

  for (const stepType of definition.supported ?? []) {
    steps[stepType] = stepSupport.full
  }

  for (const stepType of definition.noButtons ?? []) {
    steps[stepType] = stepSupport.noButtons
  }

  return {
    limits: definition.limits,
    quickRepliesShareButtonSlots:
      definition.quickRepliesShareButtonSlots ?? false,
    nativeButtonTypes: definition.nativeButtonTypes ?? [],
    buttonStyles: definition.buttonStyles ?? null,
    steps,
    ...(definition.productMessages
      ? { productMessages: definition.productMessages }
      : {}),
  }
}

export type ChannelFlowPolicyMap = Record<ChannelType, ChannelFlowPolicy>

/** Where a group of buttons sits, which decides the policy limit it has. */
export const buttonContainers = {
  step: "step",
  card: "card",
} as const

export type ButtonContainer =
  (typeof buttonContainers)[keyof typeof buttonContainers]

/**
 * The one reading of a policy's button limit: `cardButtonCount` for the
 * buttons of a card (a `sendCard` step, a `sendCarousel` card),
 * `buttonCount` for every other step. Publish, the builder editors and the
 * worker's send-time clamp all go through it.
 */
export const getButtonCountLimit = (
  policy: Pick<ChannelFlowPolicy, "limits">,
  container: ButtonContainer,
): number =>
  container === buttonContainers.card
    ? policy.limits.cardButtonCount
    : policy.limits.buttonCount
