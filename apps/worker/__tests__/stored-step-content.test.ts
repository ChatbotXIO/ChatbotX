import type { SendFlowStepData } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { resolveStoredStepContent } from "../src/chat/utils/stored-step-content"

const step = (fields: Record<string, unknown>) =>
  ({ id: "step-1", ...fields }) as unknown as SendFlowStepData

describe("resolveStoredStepContent", () => {
  test.each([
    "sendText",
    "whatsappCallButton",
  ])("stores a %s step as text", (stepType) => {
    expect(resolveStoredStepContent(step({ stepType, text: "Hi" }))).toEqual({
      contentType: "text",
      text: "Hi",
    })
  })

  test("stores a view-catalog step as its text, marked with its footer for the inbox", () => {
    expect(
      resolveStoredStepContent(
        step({
          stepType: "sendViewCatalog",
          text: "Browse",
          footer: "Free shipping",
          thumbnailProductId: "sku-1",
        }),
      ),
    ).toEqual({
      contentType: "text",
      text: "Browse",
      contentAttributes: { viewCatalog: { footer: "Free shipping" } },
    })
  })

  test("stores a step without a text body as text with no text", () => {
    expect(
      resolveStoredStepContent(step({ stepType: "sendImage", url: "x" })),
    ).toEqual({ contentType: "text", text: null })
  })

  test("stores a location with a name: address label and string coordinates", () => {
    expect(
      resolveStoredStepContent(
        step({
          stepType: "whatsappLocation",
          name: "Head office",
          address: "1 Main St",
          latitude: 15.5,
          longitude: -108.25,
        }),
      ),
    ).toEqual({
      contentType: "location",
      text: "Head office: 1 Main St",
      contentAttributes: {
        latitude: "15.5",
        longitude: "-108.25",
        name: "Head office",
        address: "1 Main St",
      },
    })
  })

  test("falls back to the coordinates when the location has no name or address", () => {
    const stored = resolveStoredStepContent(
      step({
        stepType: "whatsappLocation",
        name: "",
        address: "",
        latitude: 1.5,
        longitude: 2.5,
      }),
    )

    expect(stored.text).toBe("1.5, 2.5")
    expect(stored.contentAttributes).toEqual({
      latitude: "1.5",
      longitude: "2.5",
      name: undefined,
      address: undefined,
    })
  })
})
