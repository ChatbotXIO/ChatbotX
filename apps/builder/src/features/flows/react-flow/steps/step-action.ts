export enum StepType {
  // SendMessage = "SendMessage",
  // StartFlow = "StartFlow",
  // Actions = "Actions",
  // Condition = "Condition",
  // SendMail = "SendMail",
  SplitTraffic = "SplitTraffic",
  StartFLow = "StartFlow",
  StartFlowStep = "StartFlowStep",
  Wait = "Wait",
  // LandingPage = "LandingPage",

  SendText = "SendText",
  SendImage = "SendImage",
  SendCard = "SendCard",
  SendCarousel = "SendCarousel",
  UserInput = "UserInput",
  SendVideo = "SendVideo",
  SendGif = "SendGif",
  SetDebounce = "SetDebounce", // Debounce each messages
  SendMessengerOtn = "SendMessengerOtn", // One time notification
  SendAudio = "SendAudio",
  SendFile = "SendFile",

  AddTag = "AddTag",
  RemoveTag = "RemoveTag",
  NotifyAgent = "NotifyAgent",
  AddCustomField = "AddCustomField",
  RemoveCustomField = "RemoveCustomField",
  AddCustomLog = "AddCustomLog",
  SubscribeBot = "SubscribeBot",
  UnsubscribeBot = "UnsubscribeBot",
  RemoveContact = "RemoveContact",
  CallApi = "CallApi",

  InboxActions = "InboxActions",
  DisableBot = "DisableBot",
  EnableBot = "EnableBot",
  AssignConversation = "AssignConversation",
  AutoAssignConversation = "AutoAssignConversation",
  UnassignConversation = "UnassignConversation",
  AddNote = "AddNote",
  FollowConversation = "FollowConversation",
  UnfollowConversation = "UnfollowConversation",
  ArchiveConversation = "ArchiveConversation",
  UnarchiveConversation = "UnarchiveConversation",
  StepContact = "StepContact",

  OpenAIActions = "OpenAIActions",
  OpenAIGenerateText = "OpenAIGenerateText",
  OpenAIGenerateTextAgent = "OpenAIGenerateTextAgent",
  OpenAIGenerateTextAdvanced = "OpenAIGenerateTextAdvanced",
  OpenAIGenerateTextAssistant = "OpenAIGenerateTextAssistant",
  OpenAIGenerateImage = "OpenAIGenerateImage",
  OpenAIAnalyzeImage = "OpenAIAnalyzeImage",
  OpenAISpeechToText = "OpenAISpeechToText",
  OpenAITextToSpeech = "OpenAITextToSpeech",
  OpenAIDeleteMessageHistory = "OpenAIDeleteMessageHistory",

  EmailActions = "EmailActions",
  MarkEmailVerified = "MarkEmailVerified",
  OptInEmail = "OptInEmail",
  OptOutEmail = "OptOutEmail",

  AddTrigger = "AddTrigger",
  TriggerMake = "TriggerMake",
  TriggerPabbly = "TriggerPabbly",
  TriggerZapier = "TriggerZapier",

  MessengerActions = "MessengerActions",
  AddMessengerCustomAudience = "AddMessengerCustomAudience",
  AddMessengerRichmenu = "AddMessengerRichmenu",

  Others = "Others",
  StartAnotherFlow = "StartAnotherFlow",
  StartAnotherStep = "StartAnotherStep",
  StartExternalStep = "StartExternalStep",
  CancelContactInput = "CancelContactInput",

  Tools = "Tools",
  GetDataFromJson = "GetDataFromJson",
  FormatDate = "FormatDate",
  RandomCode = "RandomCode",
  CountCharacters = "CountCharacters",

  SendMessageNode = "SendMessageNode",
  PerformAction = "PerformAction",
}

export const disabledCopyActionTypes = [
  StepType.MarkEmailVerified,
  StepType.OptInEmail,
  StepType.OptOutEmail,
]

export const waitUserReplyActionTypes = [StepType.UserInput]
