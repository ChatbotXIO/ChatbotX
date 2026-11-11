import {
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  sendsAsNativeCopyButton,
} from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { chunk } from "remeda"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../../../constants"
import type {
  TelegramInlineKeyboardButton,
  TelegramInlineKeyboardMarkup,
} from "../../../schema"

export const buildInlineButton = (props: {
  flowId: string
  button: ButtonStepProps
}): TelegramInlineKeyboardButton => {
  const { flowId, button } = props

  if (button.buttonType === buttonTypes.enum.openWebsite) {
    return {
      text: button.label,
      url: button.beforeStep.url,
    }
  }
  // A text that is empty or too long to copy falls through to a reply button:
  // the tap runs the `copyText` step, which answers with the text.
  if (sendsAsNativeCopyButton(channelTypes.enum.telegram, button)) {
    return {
      text: button.label,
      copy_text: { text: button.beforeStep.text },
    }
  }
  return {
    text: button.label,
    callback_data: encodeButtonPayload({ flowId, buttonId: button.id }),
  }
}

/**
 * Up to `MAX_INLINE_BUTTONS_PER_ROW` buttons share one row; a longer list puts
 * each button on its own row, so labels stay readable on a phone.
 */
const toKeyboardRows = (
  buttons: TelegramInlineKeyboardButton[],
  buttonsPerRow: number,
): TelegramInlineKeyboardButton[][] =>
  chunk(
    buttons,
    buttons.length > MAX_INLINE_BUTTONS_PER_ROW ? 1 : buttonsPerRow,
  )

export const buildInlineKeyboard = (props: {
  flowId: string
  buttons: ButtonStepProps[]
  buttonsPerRow?: number
}): TelegramInlineKeyboardMarkup => {
  const { flowId, buttons, buttonsPerRow = MAX_INLINE_BUTTONS_PER_ROW } = props

  const allButtons = buttons.map((button) =>
    buildInlineButton({ flowId, button }),
  )

  return { inline_keyboard: toKeyboardRows(allButtons, buttonsPerRow) }
}

export const buildCanonicalInlineButton = (
  button: MessageButtonTemplate,
): TelegramInlineKeyboardButton => {
  switch (button.buttonType) {
    case "url":
      return { text: button.label, url: button.url }
    case "copyText":
      return { text: button.label, copy_text: { text: button.copyText } }
    default:
      return { text: button.label, callback_data: button.postback }
  }
}

export const buildInlineKeyboardFromButtons = (
  buttons: TelegramInlineKeyboardButton[],
  buttonsPerRow = MAX_INLINE_BUTTONS_PER_ROW,
): TelegramInlineKeyboardMarkup => ({
  inline_keyboard: toKeyboardRows(buttons, buttonsPerRow),
})
