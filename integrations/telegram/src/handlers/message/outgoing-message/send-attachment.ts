import type {
  SendAudioStepSchema,
  SendFileStepSchema,
  SendImageStepSchema,
  SendMultipleImagesStepSchema,
  SendVideoStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../../../constants"
import type {
  TelegramAuthValue,
  TelegramSendAudioRequest,
  TelegramSendDocumentRequest,
  TelegramSendMediaGroupRequest,
  TelegramSendPhotoRequest,
  TelegramSendVideoRequest,
} from "../../../schema"
import {
  buildCanonicalInlineButton,
  buildInlineButton,
  buildInlineKeyboardFromButtons,
} from "./send-button"

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
  const buttons = [
    ...step.buttons.map((button) => buildInlineButton({ flowId, button })),
    ...(props.data.quickReplies ?? []).map(buildCanonicalInlineButton),
  ]

  if (buttons.length === 0) {
    yield { chat_id: chatId, photo: step.url }
    return
  }

  const keyboard = buildInlineKeyboardFromButtons(
    buttons,
    MAX_INLINE_BUTTONS_PER_ROW,
  )

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
  const buttons = [
    ...step.buttons.map((button) => buildInlineButton({ flowId, button })),
    ...(props.data.quickReplies ?? []).map(buildCanonicalInlineButton),
  ]

  const keyboard =
    buttons.length > 0
      ? buildInlineKeyboardFromButtons(buttons, MAX_INLINE_BUTTONS_PER_ROW)
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
  const buttons = [
    ...step.buttons.map((button) => buildInlineButton({ flowId, button })),
    ...(props.data.quickReplies ?? []).map(buildCanonicalInlineButton),
  ]

  if (buttons.length === 0) {
    yield { chat_id: chatId, audio: step.url }
    return
  }

  const keyboard = buildInlineKeyboardFromButtons(
    buttons,
    MAX_INLINE_BUTTONS_PER_ROW,
  )

  yield {
    chat_id: chatId,
    audio: step.url,
    reply_markup: keyboard,
  }
}

export function* convertFlowStepMultipleImages(
  props: Parameters<
    MessageHandlers<
      TelegramAuthValue,
      SendMultipleImagesStepSchema
    >["sendFlowStep"]
  >[0],
): Generator<TelegramSendMediaGroupRequest> {
  const {
    data: { step, contact },
  } = props

  const chatId = contact.sourceId
  if (!chatId) {
    return
  }

  // Telegram's sendMediaGroup does not support reply_markup/buttons.
  yield {
    chat_id: chatId,
    media: step.images.map((image) => ({
      type: "photo" as const,
      media: image.url,
    })),
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
  const buttons = [
    ...step.buttons.map((button) => buildInlineButton({ flowId, button })),
    ...(props.data.quickReplies ?? []).map(buildCanonicalInlineButton),
  ]

  if (buttons.length === 0) {
    yield { chat_id: chatId, document: step.url }
    return
  }

  const keyboard = buildInlineKeyboardFromButtons(
    buttons,
    MAX_INLINE_BUTTONS_PER_ROW,
  )

  yield {
    chat_id: chatId,
    document: step.url,
    reply_markup: keyboard,
  }
}
