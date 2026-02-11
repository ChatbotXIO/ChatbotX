export const StepType = {
  landingPage: "L01",

  // Channel (H_)
  chooseChannel: "H01",

  // Send Messages (S_)
  sendText: "S01",
  sendImage: "S02",
  sendCard: "S03",
  sendCarousel: "S04",
  sendVideo: "S05",
  sendGif: "S06",
  sendMessengerOtn: "S07", // One time notification
  sendAudio: "S08",
  sendFile: "S09",
  sendQuickReply: "S10",

  // Wait/Timing (W_)
  waitUserReply: "W01",
  setDebounce: "W02",
  wait: "W03",
  getUserData: "W04",
  typing: "W05",

  // Contact Operations (C_)
  addContactTag: "C01",
  removeContactTag: "C02",
  deleteContact: "C03",
  blockContact: "C04",
  addContactNotes: "C05",
  setCustomField: "C06",
  clearCustomField: "C07",
  cancelContactInput: "C08",
  filterContact: "C09",

  // Inbox Operations (I_)
  disableBot: "I01",
  enableBot: "I02",
  assignConversation: "I03",
  autoAssignConversation: "I04",
  unassignConversation: "I05",
  followConversation: "I06",
  unfollowConversation: "I07",
  archiveConversation: "I08",
  unarchiveConversation: "I09",
  notifyAgent: "I10",

  // AI/OpenAI Operations (A_)
  aiGenerateText: "A01",
  aiGenerateTextAgent: "A02",
  aiAnalyzeImage: "A03",
  aiGenerateImage: "A04",
  aiSpeechToText: "A05",
  aiTextToSpeech: "A06",
  aiDeleteMessageHistory: "A07",

  // Email Operations (E_)
  markEmailVerified: "E01",
  optInEmail: "E02",
  optOutEmail: "E03",

  // Utilities/Tools (U_)
  getDataFromJson: "U01",
  formatDate: "U02",
  generateCode: "U03",
  countCharacters: "U04",
  performAction: "U05",
  callApi: "U06",
  splitTraffic: "U07",

  // Flow Operations (F_)
  startAnotherNode: "F01",
  startExternalFlow: "F02",
  startExternalNode: "F03",

  // External/Others (X_)
  openWebsite: "X01",
  addNotes: "X02",

  // Broadcast Operations (B_)
  subscribeBroadcast: "B01",
  unsubscribeBroadcast: "B02",

  // Google Sheets Operations (G_)
  spreadsheetSendData: "G01",
  spreadsheetGetRow: "G02",
  spreadsheetGetRandomRow: "G03",
  spreadsheetUpdateRow: "G04",
  spreadsheetClearRow: "G05",

  // Eamil
  emailText: "M01",
  emailH3: "M02",
  emailImage: "M03",
  emailButton: "M04",
  emailSpacing: "M05",
  emailCode: "M06",
  emailLine: "M07",
  emailHeader: "M08",
} as const

export type StepType = (typeof StepType)[keyof typeof StepType]

export const disabledCopyActionTypes = [
  StepType.markEmailVerified,
  StepType.optInEmail,
  StepType.optOutEmail,
]
