import { StepType } from "@aha.chat/flow-config"
import type { JSX } from "react"
import type { ZodTypeAny } from "zod"
import { addContactTagStep } from "./add-contact-tag"
import { addNotesStep } from "./add-notes"
import { archiveConversationStep } from "./archive-conversation"
import { assignConversationStep } from "./assign-conversation"
import { autoAssignConversationStep } from "./auto-assign-conversation"
import { blockContactStep } from "./block-contact"
import { clearCustomFieldStep } from "./clear-custom-field"
import { countCharactersStep } from "./count-characters"
import { deleteContactStep } from "./delete-contact"
import { disableBotStep } from "./disable-bot"
import { enableBotStep } from "./enable-bot"
import { followConversationStep } from "./follow-conversation"
import { formatDateStep } from "./format-date"
import { generateCodeStep } from "./generate-code"
import { getDataFromJsonStep } from "./get-data-from-json"
import { markEmailVerifiedStep } from "./mark-email-verified"
import { openWebsiteStep } from "./open-website"
import { optInEmailStep } from "./opt-in-email"
import { optOutEmailStep } from "./opt-out-email"
import { removeContactTagStep } from "./remove-contact-tag"
import { sendAudioStep } from "./send-audio"
import { sendCardStep } from "./send-card"
import sendImageStep from "./send-image"
import sendTextStep from "./send-text"
import { sendVideoStep } from "./send-video"
import { setCustomFieldStep } from "./set-custom-field"
import { unarchiveConversationStep } from "./unarchive-conversation"
import { unassignConversationStep } from "./unassign-conversation"
import { unfollowConversationStep } from "./unfollow-conversation"

type StepEditorProps = {
  parentName: string
}

export type DefaultFnProps = {
  labelVersion: string
  position?: { x: number; y: number }
}

export type StepDefinition = {
  editor: (props: StepEditorProps) => JSX.Element
  // biome-ignore lint/suspicious/noExplicitAny: wip
  viewer: (props: any) => JSX.Element
  validator: ZodTypeAny
  // biome-ignore lint/suspicious/noExplicitAny: wip
  defaultFn: () => any
}

export const allSteps: Record<StepType, StepDefinition | undefined> = {
  [StepType.SEND_TEXT]: sendTextStep,
  [StepType.SEND_IMAGE]: sendImageStep,
  [StepType.SEND_CARD]: sendCardStep,
  [StepType.SEND_CAROUSEL]: sendCardStep,
  [StepType.USER_INPUT]: undefined,
  [StepType.SEND_VIDEO]: sendVideoStep,
  [StepType.SEND_GIF]: undefined,
  [StepType.SET_DEBOUNCE]: undefined,
  [StepType.SEND_MESSENGER_OTN]: undefined,
  [StepType.SEND_AUDIO]: sendAudioStep,
  [StepType.SEND_FILE]: undefined,
  [StepType.ADD_CONTACT_TAG]: addContactTagStep,
  [StepType.REMOVE_CONTACT_TAG]: removeContactTagStep,
  [StepType.NOTIFY_AGENT]: undefined,
  [StepType.ZAPIER_CUSTOM_LOG]: undefined,
  [StepType.DELETE_CONTACT]: deleteContactStep,
  [StepType.CALL_API]: undefined,
  [StepType.INBOX_ACTIONS]: undefined,
  [StepType.DISABLE_BOT]: disableBotStep,
  [StepType.ENABLE_BOT]: enableBotStep,
  [StepType.ASSIGN_CONVERSATION]: assignConversationStep,
  [StepType.AUTO_ASSIGN_CONVERSATION]: autoAssignConversationStep,
  [StepType.UNASSIGN_CONVERSATION]: unassignConversationStep,
  [StepType.ADD_CONTACT_NOTES]: addNotesStep,
  [StepType.FOLLOW_CONVERSATION]: followConversationStep,
  [StepType.UNFOLLOW_CONVERSATION]: unfollowConversationStep,
  [StepType.ARCHIVE_CONVERSATION]: archiveConversationStep,
  [StepType.UNARCHIVE_CONVERSATION]: unarchiveConversationStep,
  [StepType.BLOCK_CONTACT]: blockContactStep,
  [StepType.OPENAI_ACTIONS]: undefined,
  [StepType.OPENAI_GENERATE_TEXT]: undefined,
  [StepType.OPENAI_GENERATE_TEXT_AGENT]: undefined,
  [StepType.OPENAI_GENERATE_TEXT_ADVANCED]: undefined,
  [StepType.OPENAI_GENERATE_TEXT_ASSISTANT]: undefined,
  [StepType.OPENAI_GENERATE_IMAGE]: undefined,
  [StepType.OPENAI_ANALYZE_IMAGE]: undefined,
  [StepType.OPENAI_SPEECH_TO_TEXT]: undefined,
  [StepType.OPENAI_TEXT_TO_SPEECH]: undefined,
  [StepType.OPENAI_DELETE_MESSAGE_HISTORY]: undefined,
  [StepType.EMAIL_ACTIONS]: undefined,
  [StepType.MARK_EMAIL_VERIFIED]: markEmailVerifiedStep,
  [StepType.OPT_IN_EMAIL]: optInEmailStep,
  [StepType.OPT_OUT_EMAIL]: optOutEmailStep,
  [StepType.ADD_TRIGGER]: undefined,
  [StepType.TRIGGER_MAKE]: undefined,
  [StepType.TRIGGER_PABBLY]: undefined,
  [StepType.TRIGGER_ZAPIER]: undefined,
  [StepType.OTHERS]: undefined,
  [StepType.START_ANOTHER_FLOW]: undefined,
  [StepType.START_ANOTHER_STEP]: undefined,
  [StepType.START_EXTERNAL_STEP]: undefined,
  [StepType.CANCEL_CONTACT_INPUT]: undefined,
  [StepType.TOOLS]: undefined,
  [StepType.GET_DATA_FROM_JSON]: getDataFromJsonStep,
  [StepType.FORMAT_DATE]: formatDateStep,
  [StepType.GENERATE_CODE]: generateCodeStep,
  [StepType.COUNT_CHARACTERS]: countCharactersStep,
  [StepType.SPLIT_TRAFFIC]: undefined,
  [StepType.START_FLOW]: undefined,
  [StepType.START_FLOW_STEP]: undefined,
  [StepType.WAIT]: undefined,
  [StepType.SEND_FLOW_NODE]: undefined,
  [StepType.PERFORM_ACTION]: undefined,
  [StepType.OPEN_WEBSITE]: openWebsiteStep,
  [StepType.SET_CUSTOM_FIELD]: setCustomFieldStep,
  [StepType.CLEAR_CUSTOM_FIELD]: clearCustomFieldStep,
  [StepType.LANDING_PAGE]: undefined,
}

export function DynamicStepEditor({
  type,
  parentName,
  ...props
}: {
  type: StepType
  parentName: string
}) {
  const Element = allSteps[type]?.editor

  return Element ? <Element parentName={parentName} {...props} /> : null
}

export function DynamicStepViewer({
  type,
  data,
  ...props
}: {
  type: StepType
  // biome-ignore lint/suspicious/noExplicitAny: wip
  data: any
}) {
  const Element = allSteps[type]?.viewer

  return Element ? <Element data={data} {...props} /> : null
}
