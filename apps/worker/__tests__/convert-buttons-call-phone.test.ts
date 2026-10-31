import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import { describe, expect, test, vi } from "vitest"

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { convertButtonsToTemplate } from "../src/chat/handlers/send-flow-step"

describe("convertButtonsToTemplate — callPhoneNumber", () => {
  const callButton = {
    id: "1",
    label: "Call us",
    buttonType: "callPhoneNumber",
    beforeStep: {
      id: "2",
      stepType: "callPhoneNumber",
      phoneNumber: "+14155552671",
    },
    steps: [],
  } as ButtonStepProps

  test("emits a phoneNumber button that keeps a replayable postback", () => {
    const [template] = convertButtonsToTemplate({
      flowId: "40",
      buttons: [callButton],
    })

    expect(template).toMatchObject({
      id: "1",
      label: "Call us",
      buttonType: "phoneNumber",
      phoneNumber: "+14155552671",
    })
    expect(template).toHaveProperty("postback")
    expect((template as { postback: string }).postback).not.toBe("")
  })
})
