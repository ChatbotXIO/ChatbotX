import type { WhatsappLocationStepSchema } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { convertFlowStepWhatsappLocation } from "../src/handlers/message/outgoing-message/whatsapp-location"

type ConverterProps = Parameters<typeof convertFlowStepWhatsappLocation>[0]

const buildProps = (
  step: Partial<WhatsappLocationStepSchema>,
): ConverterProps =>
  ({
    ctx: { auth: {} },
    data: {
      contact: { sourceId: "84900000001" },
      flowId: "1",
      step: {
        id: "step-1",
        stepType: "whatsappLocation",
        name: "Mường Thanh",
        address: "Tam Kỳ",
        latitude: 15.561_419_980_411_108,
        longitude: 108.486_782_349_190_2,
        ...step,
      },
    },
  }) as unknown as ConverterProps

describe("convertFlowStepWhatsappLocation", () => {
  test("yields Meta's location message payload", () => {
    const messages = [...convertFlowStepWhatsappLocation(buildProps({}))]

    expect(messages).toEqual([
      {
        _type: "location",
        type: "location",
        location: {
          latitude: 15.561_419_980_411_108,
          longitude: 108.486_782_349_190_2,
          name: "Mường Thanh",
          address: "Tam Kỳ",
        },
      },
    ])
  })

  test("omits name and address when they are blank", () => {
    const messages = [
      ...convertFlowStepWhatsappLocation(
        buildProps({ name: "  ", address: undefined }),
      ),
    ]

    expect(messages[0]?.location).toEqual({
      latitude: 15.561_419_980_411_108,
      longitude: 108.486_782_349_190_2,
    })
  })

  test("trims name and address", () => {
    const messages = [
      ...convertFlowStepWhatsappLocation(
        buildProps({ name: "  Hotel  ", address: " Hue " }),
      ),
    ]

    expect(messages[0]?.location.name).toBe("Hotel")
    expect(messages[0]?.location.address).toBe("Hue")
  })

  test("yields nothing when the coordinates are out of range", () => {
    const messages = [
      ...convertFlowStepWhatsappLocation(buildProps({ latitude: 91 })),
    ]

    expect(messages).toEqual([])
  })
})
