import { channelTypes } from "@chatbotx.io/utils/channel"
import type { StepType } from "../steps/step-action"

export const CHANNEL_POLICY_VERSION = 1
export const stepSupport = {
  full: "full",
  noButtons: "noButtons",
  unsupported: "unsupported",
} as const

export type StepSupport = (typeof stepSupport)[keyof typeof stepSupport]

export type ManagedChannel =
  | typeof channelTypes.enum.messenger
  | typeof channelTypes.enum.tiktok

export type ChannelStepConstraints = {
  maxButtonCount?: number
  maxButtonLabelLength?: number
  maxCardTitleLength?: number
  maxTextLength?: number
}

export type ChannelStepPolicy = {
  constraints: ChannelStepConstraints
  policyVersion: number
  stepSupport: Record<StepType, StepSupport>
  surfaces: {
    builder: boolean
    flowSpec: boolean
  }
}

const { full, noButtons, unsupported } = stepSupport

/**
 * Every send-message step defaults to its existing unconstrained behavior.
 * `Record<StepType, StepSupport>` makes a newly introduced step type fail
 * compilation until the channel policy is deliberately reviewed.
 */
const defaultStepSupport: Record<StepType, StepSupport> = {
  landingPage: full,
  chooseChannel: full,
  sendText: full,
  sendImage: full,
  sendMultipleImages: full,
  sendCard: full,
  sendCarousel: full,
  sendVideo: full,
  sendGif: full,
  sendMessengerOtn: full,
  sendAudio: full,
  sendFile: full,
  sendQuickReply: full,
  waitUserReply: full,
  setDebounce: full,
  wait: full,
  followUp: full,
  getUserData: full,
  typing: full,
  addContactTag: full,
  removeContactTag: full,
  deleteContact: full,
  blockContact: full,
  addContactNotes: full,
  setCustomField: full,
  clearCustomField: full,
  cancelContactInput: full,
  appointmentScheduling: full,
  questionnaires: full,
  setUpCoupon: full,
  markCouponUsed: full,
  condition: full,
  disableBot: full,
  enableBot: full,
  assignConversation: full,
  autoAssignConversation: full,
  unassignConversation: full,
  markConversationAsUnread: full,
  markConversationAsRead: full,
  followConversation: full,
  unfollowConversation: full,
  archiveConversation: full,
  unarchiveConversation: full,
  notifyAgent: full,
  aiGenerateText: full,
  aiGenerateTextAgent: full,
  aiAnalyzeImage: full,
  aiGenerateImage: full,
  aiEditImage: full,
  aiSpeechToText: full,
  aiTextToSpeech: full,
  aiExtractData: full,
  aiDeleteMessageHistory: full,
  markEmailVerified: full,
  optInEmail: full,
  optOutEmail: full,
  getDataFromJson: full,
  formatDate: full,
  generateCode: full,
  countCharacters: full,
  performAction: full,
  callApi: full,
  executeJavascript: full,
  splitTraffic: full,
  make: full,
  triggerN8n: full,
  startAnotherNode: full,
  startExternalFlow: full,
  startExternalNode: full,
  openWebsite: full,
  addNotes: full,
  subscribeBroadcast: full,
  unsubscribeBroadcast: full,
  spreadsheetSendData: full,
  spreadsheetGetRow: full,
  spreadsheetGetRandomRow: full,
  spreadsheetUpdateRow: full,
  spreadsheetClearRow: full,
  activeCampaignSyncContact: full,
  getResponseAddContact: full,
  mailchimpAddMember: full,
  mailerLiteAddSubscriber: full,
  moosendCreateContact: full,
  dripSubscribeSubscriber: full,
  sendGridAddContact: full,
  klaviyoSyncProfile: full,
  subscribeSequence: full,
  unsubscribeSequence: full,
  email: full,
  sendWaTemplateMessage: full,
  whatsappOptionList: full,
  whatsappCallButton: full,
  whatsappFlow: full,
  sendMessengerTemplateMessage: full,
  facebookCustomAudience: full,
  sendMetaCapiEvent: full,
  setMessengerUserPersistentMenu: full,
  enableMessengerComposer: full,
  disableMessengerComposer: full,
  setMessengerPersona: full,
  updateMessengerContactData: full,
}

const messengerStepSupport: Record<StepType, StepSupport> = {
  ...defaultStepSupport,
  sendAudio: noButtons,
  sendFile: noButtons,
  sendWaTemplateMessage: unsupported,
  whatsappOptionList: unsupported,
  whatsappCallButton: unsupported,
  whatsappFlow: unsupported,
}

const tiktokStepSupport: Record<StepType, StepSupport> = {
  ...defaultStepSupport,
  sendImage: noButtons,
  sendCard: unsupported,
  sendCarousel: unsupported,
  sendVideo: unsupported,
  sendGif: unsupported,
  sendAudio: unsupported,
  sendFile: unsupported,
  sendWaTemplateMessage: unsupported,
  sendMessengerTemplateMessage: unsupported,
  whatsappOptionList: unsupported,
  whatsappCallButton: unsupported,
  whatsappFlow: unsupported,
}

export const STEP_SUPPORT: Record<ManagedChannel, ChannelStepPolicy> = {
  [channelTypes.enum.messenger]: {
    constraints: {
      maxButtonLabelLength: 20,
      maxTextLength: 2000,
    },
    policyVersion: CHANNEL_POLICY_VERSION,
    stepSupport: messengerStepSupport,
    surfaces: { builder: true, flowSpec: false },
  },
  [channelTypes.enum.tiktok]: {
    constraints: {
      maxButtonCount: 3,
      maxButtonLabelLength: 20,
      maxCardTitleLength: 40,
      maxTextLength: 6000,
    },
    policyVersion: CHANNEL_POLICY_VERSION,
    stepSupport: tiktokStepSupport,
    surfaces: { builder: true, flowSpec: false },
  },
}

export const managedChannels = Object.keys(STEP_SUPPORT) as ManagedChannel[]

export const isManagedChannel = (channel: string): channel is ManagedChannel =>
  Object.hasOwn(STEP_SUPPORT, channel)

export const getChannelStepPolicy = (
  channel: string | null | undefined,
): ChannelStepPolicy | undefined =>
  typeof channel === "string" && isManagedChannel(channel)
    ? STEP_SUPPORT[channel]
    : undefined

export const resolveStepSupport = (props: {
  channel: string | null | undefined
  stepType: StepType
}): StepSupport | undefined =>
  getChannelStepPolicy(props.channel)?.stepSupport[props.stepType]

export const isStepUnsupported = (props: {
  channel: string | null | undefined
  stepType: StepType
}): boolean => resolveStepSupport(props) === unsupported

export const isStepButtonsDropped = (props: {
  buttons: readonly unknown[] | null | undefined
  channel: string | null | undefined
  stepType: StepType
}): boolean =>
  (props.buttons?.length ?? 0) > 0 && resolveStepSupport(props) === noButtons
