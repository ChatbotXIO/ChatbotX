import { describe, expect, test, vi } from "vitest"
import { resolveLastUserInputTracking } from "../src/contact-inbox/last-user-input"

vi.mock("../src/utils", () => ({
  getPublicFileUrl: (originPath: string, storageUrl: string) =>
    `${storageUrl}/${originPath}`,
}))

describe("resolveLastUserInputTracking", () => {
  test("uses text content as the last user input", () => {
    expect(
      resolveLastUserInputTracking({
        contentType: "text",
        text: "hello",
        storageUrl: "https://files.example.com",
      }),
    ).toEqual({
      lastUserInput: "hello",
      lastUserInputType: "text",
    })
  })

  test("uses the first attachment URL and file type", () => {
    expect(
      resolveLastUserInputTracking({
        contentType: "text",
        text: "ignored",
        attachments: [{ fileType: "image", originPath: "uploads/a.png" }],
        storageUrl: "https://files.example.com",
      }),
    ).toEqual({
      lastUserInput: "https://files.example.com/uploads/a.png",
      lastUserInputType: "image",
    })
  })

  test("returns null type for unparseable content types", () => {
    expect(
      resolveLastUserInputTracking({
        contentType: "unsupported",
        text: "ignored",
        storageUrl: "https://files.example.com",
      }),
    ).toEqual({
      lastUserInput: null,
      lastUserInputType: null,
    })
  })

  test("marks an Instagram story mention instead of its media type", () => {
    expect(
      resolveLastUserInputTracking({
        contentType: "text",
        attachments: [{ fileType: "video", originPath: "uploads/story.mp4" }],
        contentAttributes: { type: "story_mention" },
        storageUrl: "https://files.example.com",
      }),
    ).toEqual({
      lastUserInput: "https://files.example.com/uploads/story.mp4",
      lastUserInputType: "storyMention",
    })
  })

  test("marks a story mention whose media failed to download", () => {
    expect(
      resolveLastUserInputTracking({
        contentType: "text",
        contentAttributes: { type: "story_mention" },
        storageUrl: "https://files.example.com",
      }),
    ).toEqual({
      lastUserInput: null,
      lastUserInputType: "storyMention",
    })
  })

  test("marks a shared Instagram reel as a reel", () => {
    expect(
      resolveLastUserInputTracking({
        contentType: "text",
        attachments: [{ fileType: "video", originPath: "uploads/reel.mp4" }],
        contentAttributes: { type: "reel_share" },
        storageUrl: "https://files.example.com",
      }),
    ).toEqual({
      lastUserInput: "https://files.example.com/uploads/reel.mp4",
      lastUserInputType: "reel",
    })
  })

  test("keeps the media type for other content attributes", () => {
    expect(
      resolveLastUserInputTracking({
        contentType: "text",
        attachments: [{ fileType: "image", originPath: "uploads/a.png" }],
        contentAttributes: { type: "story_reply" },
        storageUrl: "https://files.example.com",
      }).lastUserInputType,
    ).toBe("image")
  })

  test("a Flow response keeps its reply text, not the files it carries", () => {
    expect(
      resolveLastUserInputTracking({
        contentType: "text",
        text: "Sent",
        attachments: [{ fileType: "image", originPath: "uploads/receipt.png" }],
        contentAttributes: {
          type: "whatsapp_flow_response",
          name: "flow",
          flowResponse: { photo: [{ id: "1" }] },
          flowToken: null,
          decoded: null,
        },
        storageUrl: "https://files.example.com",
      }),
    ).toEqual({ lastUserInput: "Sent", lastUserInputType: "text" })
  })
})
