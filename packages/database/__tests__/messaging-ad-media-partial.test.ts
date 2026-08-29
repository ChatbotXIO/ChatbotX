import { describe, expect, test } from "vitest"
import {
  isLegacyImageMedia,
  isStoredImageMedia,
  type MessagingAdCreativeMediaInput,
} from "../src/partials/messaging-ad"

const legacyImage: MessagingAdCreativeMediaInput = {
  kind: "image",
  imageHash: "hash_1",
  link: "https://example.com",
}

const storedImage: MessagingAdCreativeMediaInput = {
  kind: "image",
  imageKey: "public/space/ws_1/ads-campaign/creatives/abc123",
  fileId: "file_1",
  link: "https://example.com",
}

const video: MessagingAdCreativeMediaInput = {
  kind: "video",
  videoId: "vid_1",
}

describe("isLegacyImageMedia", () => {
  test("is true for a persisted-before-the-switch row with an imageHash", () => {
    expect(isLegacyImageMedia(legacyImage)).toBe(true)
  })

  test("is false for a stored-image row (imageKey, no imageHash)", () => {
    expect(isLegacyImageMedia(storedImage)).toBe(false)
  })

  test("is false for a video", () => {
    expect(isLegacyImageMedia(video)).toBe(false)
  })
})

describe("isStoredImageMedia", () => {
  test("is true for a presigned-S3 row with an imageKey", () => {
    expect(isStoredImageMedia(storedImage)).toBe(true)
  })

  test("is false for a legacy imageHash row", () => {
    expect(isStoredImageMedia(legacyImage)).toBe(false)
  })

  test("is false for a video", () => {
    expect(isStoredImageMedia(video)).toBe(false)
  })
})
