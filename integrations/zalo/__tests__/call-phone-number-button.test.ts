import {
  type ButtonStepProps,
  getChannelFlowPolicy,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  getButtonTemplate,
  getCanonicalButtonTemplate,
} from "../src/handlers/message/outgoing-message/send-button"

describe("Zalo call phone number button", () => {
  test("the policy declares the native control this channel sends", () => {
    expect(getChannelFlowPolicy("zalo")?.nativeButtonTypes).toContain(
      "callPhoneNumber",
    )
  })

  test("a step button becomes oa.open.phone with digits and no plus", () => {
    const button = {
      id: "1",
      label: "Call us",
      buttonType: "callPhoneNumber",
      beforeStep: {
        id: "2",
        stepType: "callPhoneNumber",
        phoneNumber: "+442079460958",
      },
      steps: [],
    } as ButtonStepProps

    expect(getButtonTemplate({ flowId: "40", button })).toEqual({
      type: "oa.open.phone",
      title: "Call us",
      payload: { phone_code: "442079460958" },
    })
  })

  test("a canonical phoneNumber button becomes oa.open.phone", () => {
    expect(
      getCanonicalButtonTemplate({
        id: "1",
        label: "Call us",
        buttonType: "phoneNumber",
        phoneNumber: "+442079460958",
        postback: "payload",
      }),
    ).toEqual({
      type: "oa.open.phone",
      title: "Call us",
      payload: { phone_code: "442079460958" },
    })
  })
})
