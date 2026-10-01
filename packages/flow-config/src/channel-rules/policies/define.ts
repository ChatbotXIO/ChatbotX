import type { ChannelType } from "@chatbotx.io/utils/channel"
import { type StepType, stepTypes } from "../../steps/step-action"

export const CHANNEL_POLICY_VERSION = 1

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
  notifyAgent: "worker",
  aiGenerateText: "worker",
  aiGenerateTextAgent: "worker",
  aiAnalyzeImage: "worker",
  aiGenerateImage: "worker",
  aiEditImage: "worker",
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
  unsubscribeSequence: "worker",
  email: "worker",
  sendWaTemplateMessage: "channel",
  whatsappOptionList: "channel",
  whatsappCallButton: "channel",
  whatsappFlow: "channel",
  sendMessengerTemplateMessage: "channel",
  facebookCustomAudience: "worker",
  sendMetaCapiEvent: "worker",
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
  stepTypes.enum.sendFile,
  stepTypes.enum.sendGif,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendMessengerTemplateMessage,
  stepTypes.enum.sendMultipleImages,
  stepTypes.enum.sendQuickReply,
  stepTypes.enum.sendText,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendWaTemplateMessage,
  stepTypes.enum.whatsappCallButton,
  stepTypes.enum.whatsappFlow,
  stepTypes.enum.whatsappOptionList,
] as const satisfies readonly StepType[]

export type ChannelDeliverableStepType =
  (typeof channelDeliverableStepTypes)[number]

export type ChannelFlowPolicy = {
  limits: {
    buttonCount: number
    buttonLabel: number
    cardTitle?: number
    text: number
  }
  quickRepliesShareButtonSlots: boolean
  steps: Record<StepType, StepSupport>
}

type ChannelFlowPolicyDefinition = {
  limits: ChannelFlowPolicy["limits"]
  quickRepliesShareButtonSlots?: boolean
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
    steps,
  }
}

export type ChannelFlowPolicyMap = Record<ChannelType, ChannelFlowPolicy>
