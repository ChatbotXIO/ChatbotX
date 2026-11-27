import {
  type ButtonStepProps,
  COPY_TEXT_MAX,
  isNativeButtonType,
} from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import {
  buildCanonicalInlineButton,
  buildInlineButton,
  buildInlineKeyboard,
  buildInlineKeyboardFromButtons,
} from "../src/handlers/message/outgoing-message/send-button"

const PIX_CODE =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D"

const copyButton = (text: string): ButtonStepProps =>
  ({
    id: "1",
    label: "Copiar PIX",
    buttonType: "copyText",
    beforeStep: { id: "2", stepType: "copyText", text },
    steps: [],
  }) as ButtonStepProps

const replyButton = (id: string): ButtonStepProps =>
  ({
    id,
    label: `Plan ${id}`,
    buttonType: "sendMessage",
    beforeStep: { id: `${id}0`, stepType: "startAnotherNode", nodeId: null },
    steps: [],
  }) as unknown as ButtonStepProps

describe("telegram copy text button", () => {
  test("is a native control on Telegram", () => {
    expect(isNativeButtonType("telegram", "copyText")).toBe(true)
  })

  test("is sent as a copy_text button carrying the text", () => {
    expect(
      buildInlineButton({ flowId: "40", button: copyButton(PIX_CODE) }),
    ).toEqual({ text: "Copiar PIX", copy_text: { text: PIX_CODE } })
  })

  test("falls back to a reply button when the text is too long to copy", () => {
    const button = buildInlineButton({
      flowId: "40",
      button: copyButton("x".repeat(COPY_TEXT_MAX + 1)),
    })
    expect(button.copy_text).toBeUndefined()
    expect(button.callback_data).toEqual(expect.any(String))
  })

  test("falls back to a reply button when the text resolved to nothing", () => {
    const button = buildInlineButton({ flowId: "40", button: copyButton("") })
    expect(button.copy_text).toBeUndefined()
    expect(button.callback_data).toEqual(expect.any(String))
  })

  test("a stored copy button is rebuilt as a copy_text button", () => {
    const stored: MessageButtonTemplate = {
      id: "1",
      label: "Copiar PIX",
      buttonType: "copyText",
      copyText: PIX_CODE,
      postback: "payload",
    }
    expect(buildCanonicalInlineButton(stored)).toEqual({
      text: "Copiar PIX",
      copy_text: { text: PIX_CODE },
    })
  })
})

describe("telegram inline keyboard layout", () => {
  test("keeps up to three buttons on one row", () => {
    const keyboard = buildInlineKeyboard({
      flowId: "40",
      buttons: ["1", "2", "3"].map(replyButton),
    })
    expect(keyboard.inline_keyboard).toHaveLength(1)
    expect(keyboard.inline_keyboard[0]).toHaveLength(3)
  })

  test("puts each button on its own row past three buttons", () => {
    const keyboard = buildInlineKeyboard({
      flowId: "40",
      buttons: Array.from({ length: 10 }, (_, index) =>
        replyButton(String(index + 1)),
      ),
    })
    expect(keyboard.inline_keyboard).toHaveLength(10)
    expect(keyboard.inline_keyboard.every((row) => row.length === 1)).toBe(true)
  })

  test("applies the same layout to prebuilt buttons", () => {
    const buttons = Array.from({ length: 4 }, (_, index) => ({
      text: `Plan ${index}`,
      callback_data: `p${index}`,
    }))
    expect(
      buildInlineKeyboardFromButtons(buttons).inline_keyboard,
    ).toHaveLength(4)
  })
})
