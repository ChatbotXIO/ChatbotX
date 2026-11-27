import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import { describe, expect, test, vi } from "vitest"

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { convertButtonsToTemplate } from "../src/chat/handlers/send-flow-step"

describe("convertButtonsToTemplate — callPhoneNumber", () => {
  const callButton: ButtonStepProps = {
    id: "1",
    label: "Call us",
    buttonType: "callPhoneNumber",
    beforeStep: {
      id: "2",
      stepType: "callPhoneNumber",
      phoneNumber: "+14155552671",
    },
    steps: [],
  }

  test.each([
    "messenger",
    "zalo",
    "webchat",
  ])("emits a phoneNumber button that keeps a replayable postback on %s, which dials", (channel) => {
    const [template] = convertButtonsToTemplate({
      channel,
      flowId: "40",
      buttons: [callButton],
    })

    expect(template).toMatchObject({
      id: "1",
      label: "Call us",
      buttonType: "phoneNumber",
      phoneNumber: "+14155552671",
    })
    expect(template?.postback).not.toBe("")
  })

  test.each([
    "telegram",
    "instagram",
    "tiktok",
    "whatsapp",
  ])("stores a postback button on %s, which cannot dial, so the inbox shows what the contact got", (channel) => {
    const [template] = convertButtonsToTemplate({
      channel,
      flowId: "40",
      buttons: [callButton],
    })

    expect(template).toMatchObject({
      id: "1",
      label: "Call us",
      buttonType: "postback",
    })
    expect(template).not.toHaveProperty("phoneNumber")
    expect(template?.postback).not.toBe("")
  })
})
