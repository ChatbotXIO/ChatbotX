import { describe, expect, it } from "vitest"
import {
  isDeferrableAttachmentType,
  toPendingIncomingAttachment,
} from "../src/lib/shared/message"

describe("toPendingIncomingAttachment", () => {
  it("keeps the provider URL as the reference and has no provider id yet", () => {
    expect(
      toPendingIncomingAttachment({
        url: "https://scontent.xx.fbcdn.net/v/t1/photo.jpg?sig=abc",
        type: "image",
      }),
    ).toEqual({
      sourceId: null,
      fileType: "image",
      mimeType: "image/jpeg",
      originPath: "https://scontent.xx.fbcdn.net/v/t1/photo.jpg?sig=abc",
      size: 0,
      isPhotoMessage: true,
    })
  })

  it.each([
    ["https://cdn.example/a.png?x=1", "image", "image/png"],
    ["https://cdn.example/a.WEBP", "image", "image/webp"],
    ["https://cdn.example/a.gif", "image", "image/gif"],
    ["https://cdn.example/clip.mp4", "video", "video/mp4"],
    ["https://cdn.example/voice.m4a", "audio", "audio/mp4"],
    ["https://cdn.example/contract.pdf", "file", "application/pdf"],
    [
      "https://cdn.example/sheet.xlsx",
      "file",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  ] as const)("derives the MIME type from the URL extension: %s", (url, type, mimeType) => {
    expect(toPendingIncomingAttachment({ url, type }).mimeType).toBe(mimeType)
  })

  it.each([
    ["image", "image/jpeg"],
    ["video", "video/mp4"],
    ["audio", "audio/mpeg"],
    ["file", "application/octet-stream"],
  ] as const)("falls back to a placeholder for an extension-less %s URL", (type, mimeType) => {
    const attachment = toPendingIncomingAttachment({
      url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1",
      type,
    })
    expect(attachment.mimeType).toBe(mimeType)
    expect(attachment.fileType).toBe(type)
  })

  // The eager path stores the kind of the REAL content (a JPEG sent as a
  // `file` is an image), and everything downstream — the inbox card, a
  // getUserData image step, the Graph pairing guard — relies on that kind.
  it.each([
    ["https://cdn.example/photo.jpg", "image", "image/jpeg"],
    ["https://cdn.example/clip.mp4", "video", "video/mp4"],
    ["https://cdn.example/voice.mp3", "audio", "audio/mpeg"],
    ["https://cdn.example/contract.pdf", "file", "application/pdf"],
  ] as const)("a file-typed attachment takes its kind from the URL's MIME type: %s", (url, fileType, mimeType) => {
    expect(toPendingIncomingAttachment({ url, type: "file" })).toMatchObject({
      fileType,
      mimeType,
      isPhotoMessage: false,
    })
  })

  it("keeps an extension-less file-typed attachment a plain file", () => {
    expect(
      toPendingIncomingAttachment({
        url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1",
        type: "file",
      }),
    ).toMatchObject({
      fileType: "file",
      mimeType: "application/octet-stream",
    })
  })

  it.each([
    // Messenger voice clips are .mp4 containers delivered as audio.
    ["https://cdn.example/audio_clip_1.mp4", "audio", "audio/mpeg"],
    ["https://cdn.example/odd.pdf", "image", "image/jpeg"],
    ["https://cdn.example/odd.jpg", "video", "video/mp4"],
  ] as const)("never lets a URL extension contradict the declared kind: %s as %s", (url, type, mimeType) => {
    expect(toPendingIncomingAttachment({ url, type })).toMatchObject({
      fileType: type,
      mimeType,
    })
  })

  it("only an image message counts as a photo", () => {
    expect(
      toPendingIncomingAttachment({
        url: "https://cdn.example/a.pdf",
        type: "file",
      }).isPhotoMessage,
    ).toBe(false)
  })
})

describe("isDeferrableAttachmentType", () => {
  it.each(["image", "video", "audio", "file"])("defers %s", (type) => {
    expect(isDeferrableAttachmentType(type)).toBe(true)
  })

  it.each([
    "template",
    "location",
    "fallback",
    "share",
    "story_mention",
    "ig_reel",
    "",
  ])("keeps %s on the eager path", (type) => {
    expect(isDeferrableAttachmentType(type)).toBe(false)
  })
})
