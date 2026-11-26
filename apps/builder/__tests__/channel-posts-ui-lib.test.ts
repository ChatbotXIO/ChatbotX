import { channelPostContentTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { resolvePostAuthor } from "@/features/channel-posts/lib/post-author"
import {
  capabilityOfChannel,
  channelsReportLive,
} from "@/features/channel-posts/lib/post-capability"
import {
  CONTENT_TYPE_TILES,
  POST_TYPE_TILES,
  resolvePostTile,
} from "@/features/channel-posts/lib/post-type-style"
import {
  POST_TYPE_FILTERS,
  POST_TYPE_OPTIONS,
  POST_TYPE_QUERIES,
} from "@/features/channel-posts/lib/posts-search-params"

const TONE_PATTERN = /^bg-/

describe("post type filters", () => {
  test("every filter maps to a list query", () => {
    for (const type of POST_TYPE_FILTERS) {
      const query = POST_TYPE_QUERIES[type]
      expect(query.contentTypes || query.liveStatus).toBeTruthy()
    }
  })

  test("the live filters ask for a live status, not content types", () => {
    expect(POST_TYPE_QUERIES.liveNow).toEqual({ liveStatus: "live" })
    expect(POST_TYPE_QUERIES.pastLive).toEqual({ liveStatus: "ended" })
  })

  test("the content-type groups never overlap", () => {
    const seen = new Set<string>()
    for (const type of POST_TYPE_FILTERS) {
      for (const contentType of POST_TYPE_QUERIES[type].contentTypes ?? []) {
        expect(seen.has(contentType)).toBe(false)
        seen.add(contentType)
      }
    }
  })

  test("the display options start with all and add every filter once", () => {
    expect(POST_TYPE_OPTIONS[0]).toBe("all")
    expect(POST_TYPE_OPTIONS.slice(1)).toEqual([...POST_TYPE_FILTERS])
  })

  test("every option has a coloured tile", () => {
    for (const option of POST_TYPE_OPTIONS) {
      expect(POST_TYPE_TILES[option].tone).toMatch(TONE_PATTERN)
    }
  })

  test("every content type has a thumbnail badge", () => {
    for (const contentType of channelPostContentTypes.options) {
      expect(CONTENT_TYPE_TILES[contentType]).toBeDefined()
    }
  })

  test("a live broadcast shows the live tile while on the air and the past-live tile once ended", () => {
    expect(
      resolvePostTile({ contentType: "live", liveStatus: "live" }),
    ).toEqual({
      labelKey: "contentType.live",
      tile: POST_TYPE_TILES.liveNow,
    })
    expect(
      resolvePostTile({ contentType: "live", liveStatus: "ended" }),
    ).toEqual({
      labelKey: "postType.pastLive",
      tile: POST_TYPE_TILES.pastLive,
    })
    expect(
      resolvePostTile({ contentType: "live", liveStatus: null })?.tile,
    ).toBe(POST_TYPE_TILES.liveNow)
  })

  test("other content types ignore the live status", () => {
    expect(
      resolvePostTile({ contentType: "video", liveStatus: "ended" }),
    ).toEqual({
      labelKey: "contentType.video",
      tile: CONTENT_TYPE_TILES.video,
    })
  })

  test("a post without a content type has no tile", () => {
    expect(
      resolvePostTile({ contentType: null, liveStatus: null }),
    ).toBeUndefined()
  })
})

describe("capabilityOfChannel", () => {
  test("returns the capability of a channel with a post list", () => {
    expect(capabilityOfChannel("messenger")?.commentSettings).toBe(true)
    expect(capabilityOfChannel("threads")?.commentSettings).toBe(false)
  })

  test("is undefined for a channel without a post list", () => {
    expect(capabilityOfChannel("whatsapp")).toBeUndefined()
    expect(capabilityOfChannel("")).toBeUndefined()
  })

  test("does not match inherited object keys", () => {
    expect(capabilityOfChannel("constructor")).toBeUndefined()
    expect(capabilityOfChannel("toString")).toBeUndefined()
  })
})

describe("resolvePostAuthor", () => {
  const post = { authorName: null, channel: "messenger", inboxName: "Shop" }

  test("shows the individual creator when the channel reports one", () => {
    expect(resolvePostAuthor({ ...post, authorName: "Mai" })).toEqual({
      kind: "creator",
      name: "Mai",
    })
  })

  test("treats a creator reported without a name as a creator, by id", () => {
    expect(resolvePostAuthor({ ...post, authorExternalId: "123" })).toEqual({
      kind: "creator",
      name: "123",
    })
  })

  test("falls back to the Facebook Page as a page", () => {
    expect(resolvePostAuthor(post)).toEqual({ kind: "page", name: "Shop" })
  })

  test.each([
    "instagram",
    "threads",
    "tiktok",
    "somethingelse",
  ])("falls back to the %s account as an account", (channel) => {
    expect(resolvePostAuthor({ ...post, channel })).toEqual({
      kind: "account",
      name: "Shop",
    })
  })
})

describe("live broadcast capability", () => {
  test("Facebook reports live broadcasts, so the live filters and badges show", () => {
    expect(channelsReportLive(["messenger"])).toBe(true)
    expect(channelsReportLive(["tiktok", "messenger"])).toBe(true)
  })

  test("Instagram stays off, since only one of its two logins can end a broadcast", () => {
    expect(channelsReportLive(["instagram"])).toBe(false)
  })

  test("a channel without live status hides them", () => {
    expect(channelsReportLive(["threads", "tiktok"])).toBe(false)
    expect(channelsReportLive([])).toBe(false)
  })
})
