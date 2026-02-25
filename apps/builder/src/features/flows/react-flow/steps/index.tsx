import { StepType } from "@aha.chat/flow-config"
import { memo } from "react"
import { addContactNotesStep } from "./add-contact-notes"
import { addContactTagStep } from "./add-contact-tag"
import { addNotesStep } from "./add-notes"
import { aiGenerateTextStep } from "./ai-generate-text"
import { archiveConversationStep } from "./archive-conversation"
import { assignConversationStep } from "./assign-conversation"
import { autoAssignConversationStep } from "./auto-assign-conversation"
import { blockContactStep } from "./block-contact"
import { chooseChannelStep } from "./choose-channel"
import { clearCustomFieldStep } from "./clear-custom-field"
import { countCharactersStep } from "./count-characters"
import type { StepDefinition } from "./definition"
import { deleteContactStep } from "./delete-contact"
import { disableBotStep } from "./disable-bot"
import emailButtonStep from "./email-button"
import emailCodeStep from "./email-code"
import emailH3Step from "./email-h3"
import emailHeaderStep from "./email-header"
import emailImageStep from "./email-image"
import emailLineStep from "./email-line"
import emailSpacingStep from "./email-spacing"
import emailTextStep from "./email-text"
import { enableBotStep } from "./enable-bot"
import { followConversationStep } from "./follow-conversation"
import { formatDateStep } from "./format-date"
import { generateCodeStep } from "./generate-code"
import { getDataFromJsonStep } from "./get-data-from-json"
import { getUserDataStep } from "./get-user-data"
import { markEmailVerifiedStep } from "./mark-email-verified"
import { openWebsiteStep } from "./open-website"
import { optInEmailStep } from "./opt-in-email"
import { optOutEmailStep } from "./opt-out-email"
import { removeContactTagStep } from "./remove-contact-tag"
import sendAudioStep from "./send-audio"
import { sendCarouselStep } from "./send-carousel"
import sendFileStep from "./send-file"
import sendGifStep from "./send-gif"
import sendImageStep from "./send-image"
import sendTextStep from "./send-text"
import { sendVideoStep } from "./send-video"
import sendWaTemplateMessageStep from "./send-wa-template-message"
import { setCustomFieldStep } from "./set-custom-field"
import { spreadsheetClearRowStep } from "./spreadsheet-clear-row"
import { spreadsheetGetRandomRowStep } from "./spreadsheet-get-random-row"
import { spreadsheetGetRowStep } from "./spreadsheet-get-row"
import { spreadsheetSendDataStep } from "./spreadsheet-send-data"
import { spreadsheetUpdateRowStep } from "./spreadsheet-update-row"
import startAnotherNodeStep from "./start-another-node"
import { sendExternalFlowStep } from "./start-external-flow"
import { sendExternalNodeStep } from "./start-external-node"
import { subscribeBroadcastStep } from "./subscribe-broadcast"
import typingStep from "./typing"
import { unarchiveConversationStep } from "./unarchive-conversation"
import { unassignConversationStep } from "./unassign-conversation"
import { unfollowConversationStep } from "./unfollow-conversation"
import { unsubscribeBroadcastStep } from "./unsubscribe-broadcast"

// biome-ignore lint/suspicious/noExplicitAny: wip
export const allSteps: Record<StepType, StepDefinition<any> | undefined> = {
  [StepType.sendText]: sendTextStep,
  [StepType.sendImage]: sendImageStep,
  [StepType.sendCard]: sendCarouselStep,
  [StepType.sendCarousel]: sendCarouselStep,
  [StepType.getUserData]: getUserDataStep,
  [StepType.sendVideo]: sendVideoStep,
  [StepType.sendWaTemplateMessage]: sendWaTemplateMessageStep,
  [StepType.sendGif]: sendGifStep,
  [StepType.setDebounce]: undefined,
  [StepType.sendMessengerOtn]: undefined,
  [StepType.sendAudio]: sendAudioStep,
  [StepType.sendFile]: sendFileStep,
  [StepType.addContactTag]: addContactTagStep,
  [StepType.removeContactTag]: removeContactTagStep,
  [StepType.notifyAgent]: undefined,
  [StepType.deleteContact]: deleteContactStep,
  [StepType.callApi]: undefined,
  [StepType.disableBot]: disableBotStep,
  [StepType.enableBot]: enableBotStep,
  [StepType.assignConversation]: assignConversationStep,
  [StepType.autoAssignConversation]: autoAssignConversationStep,
  [StepType.unassignConversation]: unassignConversationStep,
  [StepType.addContactNotes]: addContactNotesStep,
  [StepType.followConversation]: followConversationStep,
  [StepType.unfollowConversation]: unfollowConversationStep,
  [StepType.archiveConversation]: archiveConversationStep,
  [StepType.unarchiveConversation]: unarchiveConversationStep,
  [StepType.blockContact]: blockContactStep,
  [StepType.markEmailVerified]: markEmailVerifiedStep,
  [StepType.optInEmail]: optInEmailStep,
  [StepType.optOutEmail]: optOutEmailStep,
  [StepType.cancelContactInput]: undefined,
  [StepType.getDataFromJson]: getDataFromJsonStep,
  [StepType.formatDate]: formatDateStep,
  [StepType.generateCode]: generateCodeStep,
  [StepType.countCharacters]: countCharactersStep,
  [StepType.splitTraffic]: undefined,
  [StepType.startExternalFlow]: sendExternalFlowStep,
  [StepType.startExternalNode]: sendExternalNodeStep,
  [StepType.startAnotherNode]: startAnotherNodeStep,
  [StepType.wait]: undefined,
  [StepType.performAction]: undefined,
  [StepType.openWebsite]: openWebsiteStep,
  [StepType.setCustomField]: setCustomFieldStep,
  [StepType.clearCustomField]: clearCustomFieldStep,
  [StepType.landingPage]: undefined,
  [StepType.subscribeBroadcast]: subscribeBroadcastStep,
  [StepType.unsubscribeBroadcast]: unsubscribeBroadcastStep,
  [StepType.chooseChannel]: chooseChannelStep,
  [StepType.filterContact]: undefined,
  [StepType.addNotes]: addNotesStep,
  [StepType.waitUserReply]: undefined,
  [StepType.aiGenerateText]: aiGenerateTextStep,
  [StepType.aiGenerateTextAgent]: undefined,
  [StepType.aiGenerateImage]: undefined,
  [StepType.aiAnalyzeImage]: undefined,
  [StepType.aiSpeechToText]: undefined,
  [StepType.aiTextToSpeech]: undefined,
  [StepType.aiDeleteMessageHistory]: undefined,
  [StepType.spreadsheetGetRow]: spreadsheetGetRowStep,
  [StepType.spreadsheetGetRandomRow]: spreadsheetGetRandomRowStep,
  [StepType.spreadsheetUpdateRow]: spreadsheetUpdateRowStep,
  [StepType.spreadsheetClearRow]: spreadsheetClearRowStep,
  [StepType.spreadsheetSendData]: spreadsheetSendDataStep,
  [StepType.sendQuickReply]: undefined,
  [StepType.emailH3]: emailH3Step,
  [StepType.emailText]: emailTextStep,
  [StepType.emailImage]: emailImageStep,
  [StepType.emailButton]: emailButtonStep,
  [StepType.emailLine]: emailLineStep,
  [StepType.emailSpacing]: emailSpacingStep,
  [StepType.emailCode]: emailCodeStep,
  [StepType.emailHeader]: emailHeaderStep,
  [StepType.typing]: typingStep,
}

export const DynamicStepEditor = memo(
  ({ type, parentName, ...props }: { type: StepType; parentName: string }) => {
    const Element = allSteps[type]?.editor

    return Element ? <Element parentName={parentName} {...props} /> : null
  },
)

export const DynamicStepViewer = memo(
  ({
    type,
    data,
    ...props
  }: {
    type: StepType
    // biome-ignore lint/suspicious/noExplicitAny: safe ignore
    data: any
  }) => {
    const Element = allSteps[type]?.viewer

    return Element ? <Element data={data} {...props} /> : null
  },
)
