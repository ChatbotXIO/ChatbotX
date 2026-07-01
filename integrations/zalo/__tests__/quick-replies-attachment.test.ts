import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const quickReplies: ButtonStepProps[] = [
  { id: "qr-1", label: "Yes", buttonType: null, beforeStep: null, steps: [] },
]

describe("zalo quick replies attachment", () => {
  test("merges node quick replies into the text template buttons", () => {
    const [payload] = Array.from(
      convertFlowStepText({
        data: {
          contact: { id: "ci-1" },
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

    expect(payload.attachment?.payload.buttons).toEqual([
      expect.objectContaining({ title: "Existing" }),
      expect.objectContaining({ title: "Yes" }),
    ])
  })

  test("throws instead of silently truncating when merged buttons exceed Zalo max", () => {
    expect(() =>
      Array.from(
        convertFlowStepText({
          data: {
            contact: { id: "ci-1" },
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
            quickReplies: Array.from({ length: 5 }, (_, index) => ({
              id: `qr-${index}`,
              label: `QR ${index}`,
              buttonType: null,
              beforeStep: null,
              steps: [],
            })),
          },
        } as never),
      ),
    ).toThrow("Zalo template buttons support at most 5")
  })
})
