import {
  type ButtonStepProps,
  getChannelFlowPolicy,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { buildWhatsappButtonMessages } from "../src/handlers/message/outgoing-message/shared"

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

describe("whatsapp call phone number button", () => {
  test("has no native call control, so the policy does not declare one", () => {
    expect(getChannelFlowPolicy("whatsapp")?.nativeButtonTypes).toEqual([])
  })

  test("is sent as an ordinary reply button that does not leak the number", () => {
    const messages = buildWhatsappButtonMessages({
      flowId: "40",
      buttons: [callButton],
      bodyText: "Need help?",
    })

    expect(messages).toHaveLength(1)
    const serialized = JSON.stringify(messages)
    expect(serialized).toContain("Call us")
    expect(serialized).not.toContain("14155552671")
  })
})
