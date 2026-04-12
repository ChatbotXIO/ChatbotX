import { addContactNotesStepSchema } from "./steps/add-contact-notes"
import { addContactTagStepSchema } from "./steps/add-contact-tag"
import { aiGenerateImageSchema } from "./steps/ai-generate-image"
import { aiGenerateTextSchema } from "./steps/ai-generate-text"
import { archiveConversationStepSchema } from "./steps/archive-conversation"
import { assignConversationStepSchema } from "./steps/assign-conversation"
import { autoAssignConversationStepSchema } from "./steps/auto-assign-conversation"
import { blockContactStepSchema } from "./steps/block-contact"
import { clearCustomFieldStepSchema } from "./steps/clear-custom-field"
import { countCharactersStepSchema } from "./steps/count-characters"
import { deleteContactStepSchema } from "./steps/delete-contact"
import { disableBotStepSchema } from "./steps/disable-bot"
import { enableBotStepSchema } from "./steps/enable-bot"
import { followConversationStepSchema } from "./steps/follow-conversation"
import { formatDateStepSchema } from "./steps/format-date"
import { generateCodeStepSchema } from "./steps/generate-code"
import { getDataFromJsonStepSchema } from "./steps/get-data-from-json"
import { markEmailVerifiedStepSchema } from "./steps/mark-email-verified"
import { optInEmailStepSchema } from "./steps/opt-in-email"
import { optOutEmailStepSchema } from "./steps/opt-out-email"
import { removeContactTagStepSchema } from "./steps/remove-contact-tag"
import { setCustomFieldStepSchema } from "./steps/set-custom-field"
import { spreadsheetClearRowSchema } from "./steps/spreadsheet-clear-row"
import { spreadsheetGetRowSchema } from "./steps/spreadsheet-get-row"
import { spreadsheetGetRandomRowSchema } from "./steps/spreadsheet-random-row"
import { spreadsheetSendDataSchema } from "./steps/spreadsheet-send-data"
import { spreadsheetUpdateRowSchema } from "./steps/spreadsheet-update-row"
import { startAnotherNodeStepSchema } from "./steps/start-another-node"
import { startExternalFlowStepSchema } from "./steps/start-external-flow"
import { startExternalNodeStepSchema } from "./steps/start-external-node"
import { subscribeBroadcastStepSchema } from "./steps/subscribe-broadcast"
import { subscribeSequenceStepSchema } from "./steps/subscribe-sequence"
import { unarchiveConversationStepSchema } from "./steps/unarchive-conversation"
import { unassignConversationStepSchema } from "./steps/unassign-conversation"
import { unfollowConversationStepSchema } from "./steps/unfollow-conversation"
import { unsubscribeBroadcastStepSchema } from "./steps/unsubscribe-broadcast"
import { unsubscribeSequenceStepSchema } from "./steps/unsubscribe-sequence"

const inboxSteps = [
  enableBotStepSchema,
  disableBotStepSchema,
  assignConversationStepSchema,
  autoAssignConversationStepSchema,
  unassignConversationStepSchema,
  followConversationStepSchema,
  unfollowConversationStepSchema,
  archiveConversationStepSchema,
  unarchiveConversationStepSchema,
]

const contactSteps = [
  addContactNotesStepSchema,
  blockContactStepSchema,
  addContactTagStepSchema,
  removeContactTagStepSchema,
  setCustomFieldStepSchema,
  clearCustomFieldStepSchema,
  deleteContactStepSchema,
]

const broadcastSteps = [
  subscribeBroadcastStepSchema,
  unsubscribeBroadcastStepSchema,
]

const sequenceSteps = [
  subscribeSequenceStepSchema,
  unsubscribeSequenceStepSchema,
]

const toolSteps = [
  getDataFromJsonStepSchema,
  formatDateStepSchema,
  generateCodeStepSchema,
  countCharactersStepSchema,
]

const emailSteps = [
  markEmailVerifiedStepSchema,
  optInEmailStepSchema,
  optOutEmailStepSchema,
]

const flowSteps = [
  startAnotherNodeStepSchema,
  startExternalFlowStepSchema,
  startExternalNodeStepSchema,
]

const aiSteps = [aiGenerateTextSchema, aiGenerateImageSchema]

const googleSheetStep = [
  spreadsheetGetRowSchema,
  spreadsheetClearRowSchema,
  spreadsheetGetRandomRowSchema,
  spreadsheetSendDataSchema,
  spreadsheetUpdateRowSchema,
]

export const actionSteps = [
  ...inboxSteps,
  ...contactSteps,
  ...broadcastSteps,
  ...sequenceSteps,
  ...toolSteps,
  ...emailSteps,
  ...flowSteps,
  ...aiSteps,
  ...googleSheetStep,
]
