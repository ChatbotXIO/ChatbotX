import { describe, expect, it } from "vitest"
import { toKeepOriginal } from "../src/lib/shared/message"

describe("toKeepOriginal", () => {
  it("keeps an image sent as a file", () => {
    expect(toKeepOriginal({ fileType: "image", isPhotoMessage: false })).toBe(
      true,
    )
    expect(toKeepOriginal({ fileType: "image" })).toBe(true)
  })

  it("re-encodes a photo message", () => {
    expect(toKeepOriginal({ fileType: "image", isPhotoMessage: true })).toBe(
      false,
    )
  })

  it("has no opinion on non-images", () => {
    expect(toKeepOriginal({ fileType: "video", isPhotoMessage: true })).toBe(
      null,
    )
    expect(toKeepOriginal({ fileType: "file" })).toBe(null)
  })

  // A pending attachment's kind is a guess from its URL: an extension-less
  // file may turn out to be an image once it is downloaded, and must not be
  // re-encoded then.
  it("keeps a file the channel explicitly marked as not a photo", () => {
    expect(toKeepOriginal({ fileType: "file", isPhotoMessage: false })).toBe(
      true,
    )
  })
})
