import { type ButtonStepProps, ButtonType } from "@chatbotx.io/flow-config"
import { chunk } from "remeda"
import type {
  TelegramInlineKeyboardButton,
  TelegramInlineKeyboardMarkup,
} from "../../../schema"

/**
 * Encodes button payload compactly for Telegram's 64-byte callback_data limit.
 * Format: "{flowId}.{buttonId}" — e.g. two cuid2 IDs (24 chars each) + separator = 49 chars.
 */
export const encodeTelegramCallbackData = (
  flowId: string,
  buttonId: string,
): string => `${flowId}.${buttonId}`

export const buildInlineButton = (props: {
  flowId: string
  button: ButtonStepProps
}): TelegramInlineKeyboardButton => {
  const { flowId, button } = props

  switch (button.buttonType) {
    case ButtonType.OpenWebsite:
      return {
        text: button.label,
        url: button.beforeStep.url,
      }
    default:
      return {
        text: button.label,
        callback_data: encodeTelegramCallbackData(flowId, button.id),
      }
  }
}

export const buildInlineKeyboard = (props: {
  flowId: string
  buttons: ButtonStepProps[]
  buttonsPerRow?: number
}): TelegramInlineKeyboardMarkup => {
  const { flowId, buttons, buttonsPerRow = 3 } = props

  const allButtons = buttons.map((button) =>
    buildInlineButton({ flowId, button }),
  )

  const rows = chunk(allButtons, buttonsPerRow)

  return { inline_keyboard: rows }
}
