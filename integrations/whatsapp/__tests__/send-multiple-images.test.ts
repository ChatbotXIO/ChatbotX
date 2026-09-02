import { describe, expect, test } from "vitest"
import { convertFlowStepMultipleImages } from "../src/handlers/message/outgoing-message/send-image"

describe("whatsapp convertFlowStepMultipleImages (fallback)", () => {
  test("yields N sequential single-image messages, one per url", () => {
    const messages = Array.from(
      convertFlowStepMultipleImages({
        data: {
          step: {
            id: "step-1",
            stepType: "sendMultipleImages",
            images: [
              { id: "img-1", mode: "url", url: "https://example.com/a.png" },
              { id: "img-2", mode: "url", url: "https://example.com/b.png" },
              { id: "img-3", mode: "url", url: "https://example.com/c.png" },
            ],
          },
        },
      } as never),
    )

    expect(messages).toHaveLength(3)
    expect(
      messages.map((message) => (message as { link?: string }).link),
    ).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
      "https://example.com/c.png",
    ])
  })
})
