import { describe, expect, test } from "vitest"
import { convertFlowStepMultipleImages } from "../src/handlers/message/outgoing-message/send-attachment"

describe("telegram convertFlowStepMultipleImages", () => {
  test("yields exactly one sendMediaGroup payload with all images as photos", () => {
    const [payload] = Array.from(
      convertFlowStepMultipleImages({
        data: {
          contact: { sourceId: "chat-1" },
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

    expect(payload).toEqual({
      chat_id: "chat-1",
      media: [
        { type: "photo", media: "https://example.com/a.png" },
        { type: "photo", media: "https://example.com/b.png" },
        { type: "photo", media: "https://example.com/c.png" },
      ],
    })
  })

  test("yields nothing when the contact has no sourceId (chat_id)", () => {
    const payloads = Array.from(
      convertFlowStepMultipleImages({
        data: {
          contact: { sourceId: null },
          step: {
            id: "step-1",
            stepType: "sendMultipleImages",
            images: [
              { id: "img-1", mode: "url", url: "https://example.com/a.png" },
              { id: "img-2", mode: "url", url: "https://example.com/b.png" },
            ],
          },
        },
      } as never),
    )

    expect(payloads).toHaveLength(0)
  })
})
