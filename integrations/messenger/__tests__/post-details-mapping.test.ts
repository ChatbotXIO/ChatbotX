import { describe, expect, test } from "vitest"
import { toChannelPostDetails } from "../src/apis/post"

describe("toChannelPostDetails", () => {
  test("maps Facebook post fields into the channel-neutral post description", () => {
    expect(
      toChannelPostDetails({
        created_time: "2026-01-01T00:00:00+0000",
        full_picture: "https://cdn.example/photo.jpg",
        message: "A post",
        permalink_url: "https://facebook.example/p/1",
      }),
    ).toEqual({
      caption: "A post",
      permalink: "https://facebook.example/p/1",
      publishedAt: new Date("2026-01-01T00:00:00+0000"),
      thumbnailUrl: "https://cdn.example/photo.jpg",
    })
  })

  test("leaves the caption and picture undefined for a post without them", () => {
    const details = toChannelPostDetails({
      created_time: "2026-01-01T00:00:00+0000",
    })

    expect(details.caption).toBeUndefined()
    expect(details.thumbnailUrl).toBeUndefined()
  })
})
