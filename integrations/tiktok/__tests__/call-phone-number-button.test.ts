import {
  type ButtonStepProps,
  getChannelFlowPolicy,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { getButtonTemplate } from "../src/handlers/message/outgoing-message/send-button"

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

describe("tiktok call phone number button", () => {
  test("has no native call control, so the policy does not declare one", () => {
    expect(getChannelFlowPolicy("tiktok")?.nativeButtonTypes).toEqual([])
  })

  test("is sent as the ordinary reply button", () => {
    expect(
      getButtonTemplate({ flowId: "40", button: callButton }),
    ).toMatchObject({ type: "REPLY", title: "Call us" })
  })

  test("never leaks the phone number into the tap payload", () => {
    const button = getButtonTemplate({
      flowId: "40",
      button: callButton,
    }) as Record<string, unknown>
    expect(button.id).toEqual(expect.any(String))
    expect(String(button.id)).not.toContain("14155552671")
  })
})
