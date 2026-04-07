import type {
  SendAudioStepSchema,
  SendFileStepSchema,
  SendImageStepSchema,
  SendVideoStepSchema,
} from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../constants"
import type {
  TelegramAuthValue,
  TelegramSendAudioRequest,
  TelegramSendDocumentRequest,
  TelegramSendPhotoRequest,
  TelegramSendVideoRequest,
} from "../schemas"
import { buildInlineKeyboard } from "./send-button"

export function* convertFlowStepImage(
  props: SendFlowStepProps<TelegramAuthValue, SendImageStepSchema>,
): Generator<TelegramSendPhotoRequest> {
  const {
    data: { step, conversation, flowId },
  } = props

  const chatId = conversation.contact?.sourceId ?? conversation.sourceId
  if (!chatId) {
    return
  }

  if (step.buttons.length === 0) {
    yield { chat_id: chatId, photo: step.url }
    return
  }

  const keyboard = buildInlineKeyboard({
    flowId,
    buttons: step.buttons,
    buttonsPerRow: MAX_INLINE_BUTTONS_PER_ROW,
  })

  yield {
    chat_id: chatId,
    photo: step.url,
    reply_markup: keyboard,
  }
}

export function* convertFlowStepVideo(
  props: SendFlowStepProps<TelegramAuthValue, SendVideoStepSchema>,
): Generator<TelegramSendVideoRequest> {
  const {
    data: { step, conversation },
  } = props

  const chatId = conversation.contact?.sourceId ?? conversation.sourceId
  if (!chatId) {
    return
  }

  yield {
    chat_id: chatId,
    video: step.url,
  }
}

export function* convertFlowStepAudio(
  props: SendFlowStepProps<TelegramAuthValue, SendAudioStepSchema>,
): Generator<TelegramSendAudioRequest> {
  const {
    data: { step, conversation, flowId },
  } = props

  const chatId = conversation.contact?.sourceId ?? conversation.sourceId
  if (!chatId) {
    return
  }

  if (step.buttons.length === 0) {
    yield { chat_id: chatId, audio: step.url }
    return
  }

  const keyboard = buildInlineKeyboard({
    flowId,
    buttons: step.buttons,
    buttonsPerRow: MAX_INLINE_BUTTONS_PER_ROW,
  })

  yield {
    chat_id: chatId,
    audio: step.url,
    reply_markup: keyboard,
  }
}

export function* convertFlowStepFile(
  props: SendFlowStepProps<TelegramAuthValue, SendFileStepSchema>,
): Generator<TelegramSendDocumentRequest> {
  const {
    data: { step, conversation, flowId },
  } = props

  const chatId = conversation.contact?.sourceId ?? conversation.sourceId
  if (!chatId) {
    return
  }

  if (step.buttons.length === 0) {
    yield { chat_id: chatId, document: step.url }
    return
  }

  const keyboard = buildInlineKeyboard({
    flowId,
    buttons: step.buttons,
    buttonsPerRow: MAX_INLINE_BUTTONS_PER_ROW,
  })

  yield {
    chat_id: chatId,
    document: step.url,
    reply_markup: keyboard,
  }
}
