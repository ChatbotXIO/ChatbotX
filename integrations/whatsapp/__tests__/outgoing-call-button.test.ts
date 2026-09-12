import type { WhatsappCallButtonStepSchema } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { convertFlowStepWhatsappCallButton } from "../src/handlers/message/outgoing-message/whatsapp-call-button"

type ConverterProps = Parameters<typeof convertFlowStepWhatsappCallButton>[0]

const buildProps = (
  step: Partial<WhatsappCallButtonStepSchema>,
): ConverterProps =>
  ({
    ctx: { auth: {} },
    data: {
      contact: { sourceId: "84900000001" },
      flowId: "1",
      step: {
        id: "step-1",
        stepType: "whatsappCallButton",
        text: "Need help faster? Call us!",
        buttonLabel: "Call on WhatsApp",
        ...step,
      },
    },
  }) as unknown as ConverterProps

describe("convertFlowStepWhatsappCallButton", () => {
  test("yields Meta's voice_call interactive payload", () => {
    const messages = [...convertFlowStepWhatsappCallButton(buildProps({}))]

    expect(messages).toEqual([
      {
        _type: "interactive_voice_call",
        type: "interactive",
        interactive: {
          type: "voice_call",
          body: { text: "Need help faster? Call us!" },
          action: {
            name: "voice_call",
            parameters: { display_text: "Call on WhatsApp" },
          },
        },
      },
    ])
  })

  test("clamps the button label to Meta's 20-char display_text limit", () => {
    const messages = [
      ...convertFlowStepWhatsappCallButton(
        buildProps({ buttonLabel: "A very long call button label" }),
      ),
    ]

    expect(
      messages[0]?.interactive.action.parameters.display_text,
    ).toHaveLength(20)
  })

  test("yields nothing when the body resolved to blank", () => {
    const messages = [
      ...convertFlowStepWhatsappCallButton(buildProps({ text: "   " })),
    ]

    expect(messages).toEqual([])
  })
})
