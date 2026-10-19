import { describe, expect, test } from "vitest"
import { channelTypes } from "../src/channel"
import {
  checkInboxImages,
  getInboxImageLimit,
  INBOX_IMAGE_SUPPORT,
  isImageMimeType,
  resolveInboxReplyKind,
} from "../src/inbox-image-support"

describe("INBOX_IMAGE_SUPPORT", () => {
  test("declares a limit for every channel", () => {
    for (const channel of channelTypes.options) {
      expect(INBOX_IMAGE_SUPPORT[channel]).toBeDefined()
    }
  })

  test("blocks images on threads and on instagram/tiktok comment replies", () => {
    expect(getInboxImageLimit({ channel: "threads", kind: "message" })).toBe(0)
    expect(getInboxImageLimit({ channel: "threads", kind: "comment" })).toBe(0)
    expect(getInboxImageLimit({ channel: "instagram", kind: "comment" })).toBe(
      0,
    )
    expect(getInboxImageLimit({ channel: "tiktok", kind: "comment" })).toBe(0)
  })

  test("allows a single image on a messenger comment reply", () => {
    expect(getInboxImageLimit({ channel: "messenger", kind: "comment" })).toBe(
      1,
    )
  })

  test("treats messenger/instagram private replies like DMs, tiktok's carry nothing", () => {
    expect(
      getInboxImageLimit({ channel: "messenger", kind: "privateReply" }),
    ).toBe(10)
    expect(
      getInboxImageLimit({ channel: "instagram", kind: "privateReply" }),
    ).toBe(10)
    expect(
      getInboxImageLimit({ channel: "tiktok", kind: "privateReply" }),
    ).toBe(0)
  })
})

describe("resolveInboxReplyKind", () => {
  test("a private reply wins over its reply target", () => {
    expect(
      resolveInboxReplyKind({ hasReplyTarget: true, isPrivateReply: true }),
    ).toBe("privateReply")
  })

  test("a reply target without the private flag is a comment reply", () => {
    expect(
      resolveInboxReplyKind({ hasReplyTarget: true, isPrivateReply: false }),
    ).toBe("comment")
  })

  test("no reply target is a direct message", () => {
    expect(
      resolveInboxReplyKind({ hasReplyTarget: false, isPrivateReply: false }),
    ).toBe("message")
  })
})

describe("checkInboxImages", () => {
  test("accepts a reply without images anywhere", () => {
    expect(
      checkInboxImages({ channel: "threads", kind: "comment", imageCount: 0 }),
    ).toEqual({ ok: true })
  })

  test("accepts images in a direct message thread", () => {
    expect(
      checkInboxImages({ channel: "tiktok", kind: "message", imageCount: 3 }),
    ).toEqual({ ok: true })
  })

  test("accepts images on an instagram private reply", () => {
    expect(
      checkInboxImages({
        channel: "instagram",
        kind: "privateReply",
        imageCount: 1,
      }),
    ).toEqual({ ok: true })
  })

  test("rejects images where the channel cannot send them", () => {
    expect(
      checkInboxImages({
        channel: "instagram",
        kind: "comment",
        imageCount: 1,
      }),
    ).toEqual({ ok: false, reason: "imagesNotSupported", max: 0 })
  })

  test("rejects more images than the channel allows", () => {
    expect(
      checkInboxImages({
        channel: "messenger",
        kind: "comment",
        imageCount: 2,
      }),
    ).toEqual({ ok: false, reason: "tooManyImages", max: 1 })
  })
})

describe("isImageMimeType", () => {
  test("recognises images only", () => {
    expect(isImageMimeType("image/png")).toBe(true)
    expect(isImageMimeType("application/pdf")).toBe(false)
    expect(isImageMimeType("video/mp4")).toBe(false)
  })
})
