import type {
  SendAudioStepSchema,
  SendFileStepSchema,
  SendImageStepSchema,
  SendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../../../constants"
import type {
  TelegramAuthValue,
  TelegramSendAudioRequest,
  TelegramSendDocumentRequest,
  TelegramSendPhotoRequest,
  TelegramSendVideoRequest,
} from "../../../schema"
import { buildInlineKeyboard } from "./send-button"

export function* convertFlowStepImage(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, SendImageStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendPhotoRequest> {
  const {
    data: { step, contact, flowId },
  } = props

  const chatId = contact.sourceId
  if (!chatId) {
    return
  }
  const buttons = [...step.buttons, ...(props.data.quickReplies ?? [])]

  if (buttons.length === 0) {
    yield { chat_id: chatId, photo: step.url }
    return
  }

  const keyboard = buildInlineKeyboard({
    flowId,
    buttons,
    buttonsPerRow: MAX_INLINE_BUTTONS_PER_ROW,
  })

  yield {
    chat_id: chatId,
    photo: step.url,
    reply_markup: keyboard,
  }
}

export function* convertFlowStepVideo(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, SendVideoStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendVideoRequest> {
  const {
    data: { step, contact, flowId },
  } = props

  const chatId = contact.sourceId
  if (!chatId) {
    return
  }
  const buttons = [...step.buttons, ...(props.data.quickReplies ?? [])]

  const keyboard =
    buttons.length > 0
      ? buildInlineKeyboard({
          flowId,
          buttons,
          buttonsPerRow: MAX_INLINE_BUTTONS_PER_ROW,
        })
      : undefined

  yield {
    chat_id: chatId,
    video: step.url,
    reply_markup: keyboard,
  }
}

export function* convertFlowStepAudio(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, SendAudioStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendAudioRequest> {
  const {
    data: { step, contact, flowId },
  } = props

  const chatId = contact.sourceId
  if (!chatId) {
    return
  }
  const buttons = [...step.buttons, ...(props.data.quickReplies ?? [])]

  if (buttons.length === 0) {
    yield { chat_id: chatId, audio: step.url }
    return
  }

  const keyboard = buildInlineKeyboard({
    flowId,
    buttons,
    buttonsPerRow: MAX_INLINE_BUTTONS_PER_ROW,
  })

  yield {
    chat_id: chatId,
    audio: step.url,
    reply_markup: keyboard,
  }
}

export function* convertFlowStepFile(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, SendFileStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendDocumentRequest> {
  const {
    data: { step, contact, flowId },
  } = props

  const chatId = contact.sourceId
  if (!chatId) {
    return
  }
  const buttons = [...step.buttons, ...(props.data.quickReplies ?? [])]

  if (buttons.length === 0) {
    yield { chat_id: chatId, document: step.url }
    return
  }

  const keyboard = buildInlineKeyboard({
    flowId,
    buttons,
    buttonsPerRow: MAX_INLINE_BUTTONS_PER_ROW,
  })

  yield {
    chat_id: chatId,
    document: step.url,
    reply_markup: keyboard,
  }
}
