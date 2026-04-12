import { type StepType, stepTypes } from "@chatbotx.io/flow-config"
import { memo } from "react"
import { addContactNotesStep } from "./add-contact-notes"
import { addContactTagStep } from "./add-contact-tag"
import { addNotesStep } from "./add-notes"
import { aiGenerateImageStep } from "./ai-generate-image/index"
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
import { splitTrafficStep } from "./split-traffic"
import { spreadsheetClearRowStep } from "./spreadsheet-clear-row"
import { spreadsheetGetRandomRowStep } from "./spreadsheet-get-random-row"
import { spreadsheetGetRowStep } from "./spreadsheet-get-row"
import { spreadsheetSendDataStep } from "./spreadsheet-send-data"
import { spreadsheetUpdateRowStep } from "./spreadsheet-update-row"
import startAnotherNodeStep from "./start-another-node"
import { sendExternalFlowStep } from "./start-external-flow"
import { sendExternalNodeStep } from "./start-external-node"
import { subscribeBroadcastStep } from "./subscribe-broadcast"
import { subscribeSequenceStep } from "./subscribe-schedule"
import typingStep from "./typing"
import { unarchiveConversationStep } from "./unarchive-conversation"
import { unassignConversationStep } from "./unassign-conversation"
import { unfollowConversationStep } from "./unfollow-conversation"
import { unsubscribeBroadcastStep } from "./unsubscribe-broadcast"
import { unsubscribeSequenceStep } from "./unsubscribe-sequence"

// biome-ignore lint/suspicious/noExplicitAny: wip
export const allSteps: Record<StepType, StepDefinition<any> | undefined> = {
  [stepTypes.enum.sendText]: sendTextStep,
  [stepTypes.enum.sendImage]: sendImageStep,
  [stepTypes.enum.sendCard]: sendCarouselStep,
  [stepTypes.enum.sendCarousel]: sendCarouselStep,
  [stepTypes.enum.getUserData]: getUserDataStep,
  [stepTypes.enum.sendVideo]: sendVideoStep,
  [stepTypes.enum.sendWaTemplateMessage]: sendWaTemplateMessageStep,
  [stepTypes.enum.sendGif]: sendGifStep,
  [stepTypes.enum.setDebounce]: undefined,
  [stepTypes.enum.sendMessengerOtn]: undefined,
  [stepTypes.enum.sendAudio]: sendAudioStep,
  [stepTypes.enum.sendFile]: sendFileStep,
  [stepTypes.enum.addContactTag]: addContactTagStep,
  [stepTypes.enum.removeContactTag]: removeContactTagStep,
  [stepTypes.enum.notifyAgent]: undefined,
  [stepTypes.enum.deleteContact]: deleteContactStep,
  [stepTypes.enum.callApi]: undefined,
  [stepTypes.enum.disableBot]: disableBotStep,
  [stepTypes.enum.enableBot]: enableBotStep,
  [stepTypes.enum.assignConversation]: assignConversationStep,
  [stepTypes.enum.autoAssignConversation]: autoAssignConversationStep,
  [stepTypes.enum.unassignConversation]: unassignConversationStep,
  [stepTypes.enum.addContactNotes]: addContactNotesStep,
  [stepTypes.enum.followConversation]: followConversationStep,
  [stepTypes.enum.unfollowConversation]: unfollowConversationStep,
  [stepTypes.enum.archiveConversation]: archiveConversationStep,
  [stepTypes.enum.unarchiveConversation]: unarchiveConversationStep,
  [stepTypes.enum.blockContact]: blockContactStep,
  [stepTypes.enum.markEmailVerified]: markEmailVerifiedStep,
  [stepTypes.enum.optInEmail]: optInEmailStep,
  [stepTypes.enum.optOutEmail]: optOutEmailStep,
  [stepTypes.enum.cancelContactInput]: undefined,
  [stepTypes.enum.getDataFromJson]: getDataFromJsonStep,
  [stepTypes.enum.formatDate]: formatDateStep,
  [stepTypes.enum.generateCode]: generateCodeStep,
  [stepTypes.enum.countCharacters]: countCharactersStep,
  [stepTypes.enum.splitTraffic]: splitTrafficStep,
  [stepTypes.enum.startExternalFlow]: sendExternalFlowStep,
  [stepTypes.enum.startExternalNode]: sendExternalNodeStep,
  [stepTypes.enum.startAnotherNode]: startAnotherNodeStep,
  [stepTypes.enum.wait]: undefined,
  [stepTypes.enum.performAction]: undefined,
  [stepTypes.enum.openWebsite]: openWebsiteStep,
  [stepTypes.enum.setCustomField]: setCustomFieldStep,
  [stepTypes.enum.clearCustomField]: clearCustomFieldStep,
  [stepTypes.enum.landingPage]: undefined,
  [stepTypes.enum.subscribeBroadcast]: subscribeBroadcastStep,
  [stepTypes.enum.unsubscribeBroadcast]: unsubscribeBroadcastStep,
  [stepTypes.enum.subscribeSequence]: subscribeSequenceStep,
  [stepTypes.enum.unsubscribeSequence]: unsubscribeSequenceStep,
  [stepTypes.enum.chooseChannel]: chooseChannelStep,
  [stepTypes.enum.filterContact]: undefined,
  [stepTypes.enum.addNotes]: addNotesStep,
  [stepTypes.enum.waitUserReply]: undefined,
  [stepTypes.enum.aiGenerateText]: aiGenerateTextStep,
  [stepTypes.enum.aiGenerateTextAgent]: undefined,
  [stepTypes.enum.aiGenerateImage]: aiGenerateImageStep,
  [stepTypes.enum.aiAnalyzeImage]: undefined,
  [stepTypes.enum.aiSpeechToText]: undefined,
  [stepTypes.enum.aiTextToSpeech]: undefined,
  [stepTypes.enum.aiDeleteMessageHistory]: undefined,
  [stepTypes.enum.spreadsheetGetRow]: spreadsheetGetRowStep,
  [stepTypes.enum.spreadsheetGetRandomRow]: spreadsheetGetRandomRowStep,
  [stepTypes.enum.spreadsheetUpdateRow]: spreadsheetUpdateRowStep,
  [stepTypes.enum.spreadsheetClearRow]: spreadsheetClearRowStep,
  [stepTypes.enum.spreadsheetSendData]: spreadsheetSendDataStep,
  [stepTypes.enum.sendQuickReply]: undefined,
  [stepTypes.enum.emailH3]: emailH3Step,
  [stepTypes.enum.emailText]: emailTextStep,
  [stepTypes.enum.emailImage]: emailImageStep,
  [stepTypes.enum.emailButton]: emailButtonStep,
  [stepTypes.enum.emailLine]: emailLineStep,
  [stepTypes.enum.emailSpacing]: emailSpacingStep,
  [stepTypes.enum.emailCode]: emailCodeStep,
  [stepTypes.enum.emailHeader]: emailHeaderStep,
  [stepTypes.enum.typing]: typingStep,
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
    nodeId,
    ...props
  }: {
    type: StepType
    // biome-ignore lint/suspicious/noExplicitAny: safe ignore
    data: any
    nodeId?: string
  }) => {
    const Element = allSteps[type]?.viewer

    return Element ? <Element data={data} nodeId={nodeId} {...props} /> : null
  },
)
