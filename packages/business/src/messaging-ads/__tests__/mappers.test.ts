import type { MessagingAdCreativeMediaInput } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { mapCreativeMedia } from "../mappers"

const REQUIRES_RESOLVED_HASH_ERROR = /requires a resolved image_hash/

// ---------------------------------------------------------------------------
// mapCreativeMedia — the domain media snapshot -> Meta `link_data`/`video_data`
// mapper. A stored-image row carries no `image_hash` of its own; the create-
// time resolved hash is passed in as the second argument and never persisted.
// A legacy `imageHash` row already carries its own hash and ignores the arg.
// ---------------------------------------------------------------------------

describe("mapCreativeMedia — image", () => {
  test("a stored-image row uses the resolved hash argument", () => {
    const media: MessagingAdCreativeMediaInput = {
      kind: "image",
      imageKey: "public/space/ws_1/ads-campaign/creatives/abc",
      fileId: "file_1",
      link: "https://example.com",
      message: "Hello",
      headline: "Sale",
      description: "20% off",
      caption: "Shop now",
    }

    const result = mapCreativeMedia(media, "resolved_hash_1")

    expect(result).toEqual({
      kind: "image",
      linkData: {
        link: "https://example.com",
        image_hash: "resolved_hash_1",
        message: "Hello",
        name: "Sale",
        description: "20% off",
        caption: "Shop now",
      },
    })
  })

  test("a legacy imageHash row uses its own hash, ignoring the resolved-hash argument", () => {
    const media: MessagingAdCreativeMediaInput = {
      kind: "image",
      imageHash: "legacy_hash",
      link: "https://example.com",
    }

    const result = mapCreativeMedia(media, "should_be_ignored")

    expect(result).toEqual({
      kind: "image",
      linkData: {
        link: "https://example.com",
        image_hash: "legacy_hash",
      },
    })
  })

  test("throws when a stored-image row has no resolved hash (defensive — should never happen)", () => {
    const media: MessagingAdCreativeMediaInput = {
      kind: "image",
      imageKey: "public/space/ws_1/ads-campaign/creatives/abc",
      fileId: "file_1",
      link: "https://example.com",
    }

    expect(() => mapCreativeMedia(media)).toThrow(REQUIRES_RESOLVED_HASH_ERROR)
  })
})

describe("mapCreativeMedia — video", () => {
  test("maps the video branch unchanged, ignoring the resolved-hash argument", () => {
    const media: MessagingAdCreativeMediaInput = {
      kind: "video",
      videoId: "vid_1",
      thumbnailImageHash: "thumb_hash",
      title: "Great deal",
      message: "Hi",
      linkDescription: "Learn more",
    }

    const result = mapCreativeMedia(media, "unrelated_image_hash")

    expect(result).toEqual({
      kind: "video",
      videoData: {
        video_id: "vid_1",
        image_hash: "thumb_hash",
        title: "Great deal",
        message: "Hi",
        link_description: "Learn more",
      },
    })
  })
})
