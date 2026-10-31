import {
  type ButtonStepProps,
  getChannelFlowPolicy,
} from "@chatbotx.io/flow-config"
import { describe, expect, test, vi } from "vitest"
import { convertMessage } from "../src/handlers/message/outgoing-message"
import { getButtonTemplate } from "../src/handlers/message/outgoing-message/send-button"
import { convertFlowStepCarousel } from "../src/handlers/message/outgoing-message/send-carousel"

vi.mock("../src/apis/attachment", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ attachment_id: "att-1" }),
}))

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

const canonicalMessage = (buttons: unknown[]) =>
  ({
    contentType: "text",
    text: "Need help?",
    attachments: [],
    contentAttributes: {
      type: "template",
      payload: { templateType: "button", buttons },
    },
  }) as never

const phoneButton = {
  id: "1",
  label: "Call us",
  buttonType: "phoneNumber",
  phoneNumber: "+14155552671",
  postback: "payload",
}
const postbackButton = {
  id: "2",
  label: "More",
  buttonType: "postback",
  postback: "more",
}

describe("Messenger call phone number button", () => {
  test("the policy declares the native control this channel sends", () => {
    expect(getChannelFlowPolicy("messenger")?.nativeButtonTypes).toContain(
      "callPhoneNumber",
    )
  })

  test("a step button becomes a native phone_number button", () => {
    expect(getButtonTemplate({ flowId: "40", button: callButton })).toEqual({
      type: "phone_number",
      title: "Call us",
      payload: "+14155552671",
    })
  })

  test("a carousel card button becomes a native phone_number button", () => {
    const [message] = Array.from(
      convertFlowStepCarousel({
        data: {
          contact: { id: "ci-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendCarousel",
            cards: [
              { id: "card-1", stepType: "sendCard", buttons: [callButton] },
            ],
          },
        },
      } as never),
    )

    expect(message?.attachment.payload.elements[0]?.buttons).toEqual([
      { type: "phone_number", title: "Call us", payload: "+14155552671" },
    ])
  })

  test("a phone-only canonical message is sent as a button template", () => {
    const [message] = [...convertMessage(canonicalMessage([phoneButton]))]
    expect(message?.attachment).toMatchObject({
      type: "template",
      payload: {
        template_type: "button",
        buttons: [
          { type: "phone_number", title: "Call us", payload: "+14155552671" },
        ],
      },
    })
  })

  test("a mixed canonical message keeps both buttons in order", () => {
    const [message] = [
      ...convertMessage(canonicalMessage([postbackButton, phoneButton])),
    ]
    expect(
      (
        message?.attachment as { payload: { buttons: { type: string }[] } }
      ).payload.buttons.map((button) => button.type),
    ).toEqual(["postback", "phone_number"])
  })

  test("postback-only canonical buttons still send plain text", () => {
    const [message] = [...convertMessage(canonicalMessage([postbackButton]))]
    expect(message).toEqual({ text: "Need help?" })
  })
})
