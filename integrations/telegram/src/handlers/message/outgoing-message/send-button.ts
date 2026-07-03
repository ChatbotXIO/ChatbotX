import {
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
} from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import type {
  TelegramInlineKeyboardButton,
  TelegramInlineKeyboardMarkup,
} from "../../../schema"

export const buildInlineButton = (props: {
  flowId: string
  button: ButtonStepProps
}): TelegramInlineKeyboardButton => {
  const { flowId, button } = props

  switch (button.buttonType) {
    case buttonTypes.enum.openWebsite:
      return {
        text: button.label,
        url: button.beforeStep.url,
      }
    default:
      return {
        text: button.label,
        callback_data: encodeButtonPayload({ flowId, buttonId: button.id }),
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

export const buildCanonicalInlineButton = (
  button: MessageButtonTemplate,
): TelegramInlineKeyboardButton =>
  button.buttonType === "url"
    ? { text: button.label, url: button.url }
    : { text: button.label, callback_data: button.postback }

export const buildInlineKeyboardFromButtons = (
  buttons: TelegramInlineKeyboardButton[],
  buttonsPerRow = 3,
): TelegramInlineKeyboardMarkup => ({
  inline_keyboard: chunk(buttons, buttonsPerRow),
})
