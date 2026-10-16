import { describe, expect, test, vi } from "vitest"
import {
  hasStoryMention,
  receiveMessage,
} from "../src/handlers/message/incoming-message"

vi.mock("../src/apis/attachment", () => ({
  getMessageAttachmentEntity: vi.fn().mockResolvedValue(null),
}))

const receive = (message: Record<string, unknown>) =>
  receiveMessage({
    ctx: { auth: { metadata: { igId: "ig-1" } } } as never,
    data: {
      integrationType: "instagram",
      integrationIdentifier: "inbox-1",
      payload: {
        object: "instagram",
        entry: [
          {
            id: "ig-1",
            time: 1,
            messaging: [
              {
                sender: { id: "ig-user-1" },
                recipient: { id: "ig-1" },
                timestamp: 1,
                message: { mid: "mid-1", ...message },
              },
            ],
          },
        ],
      },
    },
  })

describe("Instagram story mentions", () => {
  test("marks a story_mention attachment with contentAttributes.type", async () => {
    const result = await receive({
      attachments: [
        { type: "story_mention", payload: { url: "https://cdn.test/s.jpg" } },
      ],
    })
    expect(result.message?.contentAttributes).toEqual({ type: "story_mention" })
    expect(result.message?.sourceId).toBe("mid-1")
  })

  test("leaves ordinary messages and story replies unchanged", async () => {
    const plain = await receive({ text: "hi" })
    expect(plain.message?.contentAttributes).toBeUndefined()

    const reply = await receive({
      text: "nice",
      reply_to: { story: { id: "story-1" } },
    })
    expect(reply.message?.contentAttributes).toEqual({
      type: "story_reply",
      story: { id: "story-1" },
    })
  })

  test("hasStoryMention only matches story_mention attachments", () => {
    expect(
      hasStoryMention({
        mid: "m",
        attachments: [{ type: "image", payload: {} }],
      }),
    ).toBe(false)
    expect(
      hasStoryMention({
        mid: "m",
        attachments: [{ type: "story_mention", payload: {} }],
      }),
    ).toBe(true)
  })
})
