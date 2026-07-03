import { buttonTypes } from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const quickReplies: MessageButtonTemplate[] = [
  {
    id: "qr-1",
    label: "Yes",
    buttonType: "postback",
    postback: "flow-1::qr-1",
  },
]

const urlQuickReplies: MessageButtonTemplate[] = [
  {
    id: "qr-2",
    label: "Open",
    buttonType: "url",
    url: "https://example.com?code=flow-1::qr-2",
    postback: "flow-1::qr-2",
  },
]

describe("tiktok quick replies attachment", () => {
  test("turns text plus node quick replies into template cards", () => {
    const [payload] = Array.from(
      convertFlowStepText("business-1", {
        data: {
          contact: { id: "ci-1", sourceConversationId: "conv-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendText",
            text: "Choose",
            buttons: [],
          },
          quickReplies,
        },
      } as never),
    )

    expect(payload).toEqual(
      expect.objectContaining({
        message_type: "TEMPLATE",
        template: expect.objectContaining({
          type: "QA_BUTTON_CARD",
          title: "Choose",
          buttons: [
            expect.objectContaining({ id: "flow-1::qr-1", title: "Yes" }),
          ],
        }),
      }),
    )
  })

  test("merges existing text buttons with node quick replies", () => {
    const [payload] = Array.from(
      convertFlowStepText("business-1", {
        data: {
          contact: { id: "ci-1", sourceConversationId: "conv-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendText",
            text: "Choose",
            buttons: [
              {
                id: "btn-1",
                label: "Existing",
                buttonType: null,
                beforeStep: null,
                steps: [],
              },
            ],
          },
          quickReplies,
        },
      } as never),
    )

    expect(payload.template?.buttons).toEqual([
      expect.objectContaining({ title: "Existing" }),
      expect.objectContaining({ id: "flow-1::qr-1", title: "Yes" }),
    ])
  })

  test("keeps raw URL step buttons in link cards when quick replies are attached", () => {
    const payloads = Array.from(
      convertFlowStepText("business-1", {
        data: {
          contact: { id: "ci-1", sourceConversationId: "conv-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendText",
            text: "Choose",
            buttons: [
              {
                id: "btn-1",
                label: "Open site",
                buttonType: buttonTypes.enum.openWebsite,
                beforeStep: { url: "https://example.com" },
                steps: [],
              },
            ],
          },
          quickReplies,
        },
      } as never),
    )

    expect(payloads.map((payload) => payload.template?.type)).toEqual([
      "QA_BUTTON_CARD",
      "QA_LINK_CARD",
    ])
    expect(payloads[0]?.template?.buttons).toEqual([
      expect.objectContaining({ id: "flow-1::qr-1", title: "Yes" }),
    ])
    expect(payloads[1]?.template?.buttons).toEqual([
      expect.objectContaining({
        title: "Open site",
        id: expect.stringContaining("https://example.com"),
      }),
    ])
  })

  test("renders canonical URL quick replies as link cards with the real URL", () => {
    const [payload] = Array.from(
      convertFlowStepText("business-1", {
        data: {
          contact: { id: "ci-1", sourceConversationId: "conv-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendText",
            text: "Choose",
            buttons: [],
          },
          quickReplies: urlQuickReplies,
        },
      } as never),
    )

    expect(payload).toEqual(
      expect.objectContaining({
        message_type: "TEMPLATE",
        template: expect.objectContaining({
          type: "QA_LINK_CARD",
          title: "Choose",
          buttons: [
            expect.objectContaining({
              id: "https://example.com?code=flow-1::qr-2",
              title: "Open",
            }),
          ],
        }),
      }),
    )
  })

  test("splits mixed canonical quick replies into button and link cards", () => {
    const payloads = Array.from(
      convertFlowStepText("business-1", {
        data: {
          contact: { id: "ci-1", sourceConversationId: "conv-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendText",
            text: "Choose",
            buttons: [],
          },
          quickReplies: [...quickReplies, ...urlQuickReplies],
        },
      } as never),
    )

    expect(payloads.map((payload) => payload.template?.type)).toEqual([
      "QA_BUTTON_CARD",
      "QA_LINK_CARD",
    ])
    expect(payloads[0]?.template?.buttons).toEqual([
      expect.objectContaining({ id: "flow-1::qr-1", title: "Yes" }),
    ])
    expect(payloads[1]?.template?.buttons).toEqual([
      expect.objectContaining({
        id: "https://example.com?code=flow-1::qr-2",
        title: "Open",
      }),
    ])
  })
})
