import { describe, expect, test } from "vitest"
import { toChannelPostDetails } from "../src/apis/post"

describe("toChannelPostDetails", () => {
  test("maps Graph media fields into the channel-neutral post description", () => {
    expect(
      toChannelPostDetails({
        caption: "A video",
        media_type: "VIDEO",
        media_url: "https://cdn.example/video.mp4",
        permalink: "https://instagram.example/p/1",
        thumbnail_url: "https://cdn.example/thumb.jpg",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      caption: "A video",
      mediaType: "VIDEO",
      permalink: "https://instagram.example/p/1",
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      thumbnailUrl: "https://cdn.example/thumb.jpg",
    })
  })

  test("falls back to media_url when there is no thumbnail (images)", () => {
    expect(
      toChannelPostDetails({
        media_type: "IMAGE",
        media_url: "https://cdn.example/photo.jpg",
        timestamp: "2026-01-01T00:00:00.000Z",
      }).thumbnailUrl,
    ).toBe("https://cdn.example/photo.jpg")
  })

  test("keeps absent optional fields undefined instead of inventing values", () => {
    const details = toChannelPostDetails({
      timestamp: "2026-01-01T00:00:00.000Z",
    })

    expect(details.caption).toBeUndefined()
    expect(details.permalink).toBeUndefined()
    expect(details.thumbnailUrl).toBeUndefined()
  })
})
