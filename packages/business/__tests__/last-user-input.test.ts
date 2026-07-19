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
})
