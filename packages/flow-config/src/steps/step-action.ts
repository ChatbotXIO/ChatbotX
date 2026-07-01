import { z } from "zod"

export const stepTypes = z.enum([
  "landingPage",

  // Channel (H_)
  "chooseChannel",

  // Send Messages (S_)
  "sendText",
  "sendImage",
  "sendCard",
  "sendCarousel",
  "sendVideo",
  "sendGif",
  "sendMessengerOtn",
  "sendAudio",
  "sendFile",
  "sendQuickReply",

  // Wait/Timing (W_)
  "waitUserReply",
  "setDebounce",
  "wait",
  "getUserData",
  "typing",

  // Contact Operations (C_)
  "addContactTag",
  "removeContactTag",
  "deleteContact",
  "blockContact",
  "addContactNotes",
  "setCustomField",
  "clearCustomField",
  "cancelContactInput",
  "filterContact",

  // Inbox Operations (I_)
  "disableBot",
  "enableBot",
  "assignConversation",
  "autoAssignConversation",
  "unassignConversation",
  "followConversation",
  "unfollowConversation",
  "archiveConversation",
  "unarchiveConversation",
  "notifyAgent",

  // AI/OpenAI Operations (A_)
  "aiGenerateText",
  "aiGenerateTextAgent",
  "aiAnalyzeImage",
  "aiGenerateImage",
  "aiEditImage",
  "aiSpeechToText",
  "aiTextToSpeech",
  "aiExtractData",
  "aiDeleteMessageHistory",

  // Email Operations (E_)
  "markEmailVerified",
  "optInEmail",
  "optOutEmail",

  // Utilities/Tools (U_)
  "getDataFromJson",
  "formatDate",
  "generateCode",
  "countCharacters",
  "performAction",
  "callApi",
  "splitTraffic",

  // Flow Operations (F_)
  "startAnotherNode",
  "startExternalFlow",
  "startExternalNode",

  // External/Others (X_)
  "openWebsite",
  "addNotes",

  // Broadcast Operations (B_)
  "subscribeBroadcast",
  "unsubscribeBroadcast",

  // Google Sheets Operations (G_)
  "spreadsheetSendData",
  "spreadsheetGetRow",
  "spreadsheetGetRandomRow",
  "spreadsheetUpdateRow",
  "spreadsheetClearRow",

  // Mail Marketing Operations (M_)
  "activeCampaignSyncContact",
  "getResponseAddContact",
  "mailchimpAddMember",
  "mailerLiteAddSubscriber",
  "moosendCreateContact",
  "dripSubscribeSubscriber",
  "sendGridAddContact",
  "klaviyoSyncProfile",

  // Sequence Operations (Q_)
  "subscribeSequence",
  "unsubscribeSequence",

  // Email
  "email",

  // WhatsApp Template Message
  "sendWaTemplateMessage",
  "whatsappOptionList",
  "whatsappFlow",

  "sendMessengerTemplateMessage",

  // Messenger Operations (N_)
  "setMessengerUserPersistentMenu",
  "enableMessengerComposer",
  "disableMessengerComposer",
])

export type StepType = z.infer<typeof stepTypes>

export const disabledCopyActionTypes = [
  stepTypes.enum.markEmailVerified,
  stepTypes.enum.optInEmail,
  stepTypes.enum.optOutEmail,
]

export const hiddenActionsStepTypes = [
  stepTypes.enum.email,
  stepTypes.enum.splitTraffic,
  stepTypes.enum.wait,
]
