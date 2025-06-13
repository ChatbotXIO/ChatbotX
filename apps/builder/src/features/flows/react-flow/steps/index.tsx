import { StepType } from "@ahachat.ai/flow-config"
import type { JSX } from "react"
import type { ZodTypeAny } from "zod"
import sendTextStep from "./send-text"
import sendImageStep from "./send-image"
import { openWebsiteStep } from "./open-website"
import { setCustomFieldStep } from "./set-custom-field"
import { clearCustomFieldStep } from "./clear-custom-field"
import { addNotesStep } from "./add-notes"
import { archiveConversationStep } from "./archive-conversation"
import { assignConversationStep } from "./assign-conversation"
import { autoAssignConversationStep } from "./auto-assign-conversation"
import { blockContactStep } from "./block-contact"
import { followConversationStep } from "./follow-conversation"
import { unarchiveConversationStep } from "./unarchive-conversation"
import { sendCardStep } from "./send-card"
import { sendVideoStep } from "./send-video"
import { sendAudioStep } from "./send-audio"
import { disableBotStep } from "./disable-bot"
import { enableBotStep } from "./enable-bot"
import { unassignConversationStep } from "./unassign-conversation"
import { unfollowConversationStep } from "./unfollow-conversation"
import { optInEmailStep } from "./opt-in-email"
import { optOutEmailStep } from "./opt-out-email"
import { markEmailVerifiedStep } from "./mark-email-verified"
import { countCharactersStep } from "./count-characters"
import { formatDateStep } from "./format-date"
import { generateCodeStep } from "./generate-code"
import { getDataFromJsonStep } from "./get-data-from-json"

interface StepEditorProps {
  parentName: string
}

export interface DefaultFnProps {
  labelVersion: string
  position?: { x: number; y: number }
}

export interface StepDefinition {
  editor: (props: StepEditorProps) => JSX.Element
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  viewer: (props: any) => JSX.Element
  validator: ZodTypeAny
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
  [StepType.ADD_TAG]: undefined,
  [StepType.REMOVE_TAG]: undefined,
  [StepType.NOTIFY_AGENT]: undefined,
  [StepType.ADD_CUSTOM_LOG]: undefined,
  [StepType.SUBSCRIBE_BOT]: undefined,
  [StepType.UNSUBSCRIBE_BOT]: undefined,
  [StepType.REMOVE_CONTACT]: undefined,
  [StepType.CALL_API]: undefined,
  [StepType.INBOX_ACTIONS]: undefined,
  [StepType.DISABLE_BOT]: disableBotStep,
  [StepType.ENABLE_BOT]: enableBotStep,
  [StepType.ASSIGN_CONVERSATION]: assignConversationStep,
  [StepType.AUTO_ASSIGN_CONVERSATION]: autoAssignConversationStep,
  [StepType.UNASSIGN_CONVERSATION]: unassignConversationStep,
  [StepType.ADD_NOTES]: addNotesStep,
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
  [StepType.MESSENGER_ACTIONS]: undefined,
  [StepType.ADD_MESSENGER_CUSTOM_AUDIENCE]: undefined,
  [StepType.ADD_MESSENGER_RICHMENU]: undefined,
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
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  data: any
}) {
  const Element = allSteps[type]?.viewer

  return Element ? <Element data={data} {...props} /> : null
}
