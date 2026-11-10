import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import { describe, expect, test, vi } from "vitest"

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { convertButtonsToTemplate } from "../src/chat/handlers/send-flow-step"

const copyButton = (text: string): ButtonStepProps => ({
  id: "1",
  label: "Copiar PIX",
  buttonType: "copyText",
  beforeStep: { id: "2", stepType: "copyText", text },
  steps: [],
})

describe("convertButtonsToTemplate — copyText", () => {
  test("stores a copyText button with a replayable postback on Telegram, which copies", () => {
    const [template] = convertButtonsToTemplate({
      channel: "telegram",
      flowId: "40",
      buttons: [copyButton("PIXCODE")],
    })

    expect(template).toMatchObject({
      id: "1",
      label: "Copiar PIX",
      buttonType: "copyText",
      copyText: "PIXCODE",
    })
    expect(template?.postback).not.toBe("")
  })

  test("stores a postback button on Telegram when the text is too long to copy", () => {
    const [template] = convertButtonsToTemplate({
      channel: "telegram",
      flowId: "40",
      buttons: [copyButton("x".repeat(257))],
    })

    expect(template).toMatchObject({ buttonType: "postback" })
    expect(template).not.toHaveProperty("copyText")
  })

  test.each([
    "messenger",
    "zalo",
    "webchat",
    "instagram",
    "tiktok",
    "whatsapp",
  ])("stores a postback button on %s, which cannot copy", (channel) => {
    const [template] = convertButtonsToTemplate({
      channel,
      flowId: "40",
      buttons: [copyButton("PIXCODE")],
    })

    expect(template).toMatchObject({ id: "1", buttonType: "postback" })
    expect(template).not.toHaveProperty("copyText")
    expect(template?.postback).not.toBe("")
  })
})
