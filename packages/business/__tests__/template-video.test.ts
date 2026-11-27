import type { EmbeddedVideo } from "@chatbotx.io/utils/embedded-video"
import { describe, expect, test } from "vitest"
import {
  resolveTemplateEmbeddedVideo,
  toTemplateVideoProjection,
} from "../src/template/template-video"

const YT_A = "dQw4w9WgXcQ"
const YT_B = "2CkofPRY3V4"
const youtube = (videoId: string, aspectRatio: number | null = null) =>
  ({ provider: "youtube", videoId, aspectRatio }) satisfies EmbeddedVideo
const vimeo: EmbeddedVideo = {
  provider: "vimeo",
  videoId: "76979871",
  aspectRatio: 1.7,
}

describe("resolveTemplateEmbeddedVideo", () => {
  test("a row with neither column has no video", () => {
    expect(
      resolveTemplateEmbeddedVideo({
        embeddedVideo: null,
        youtubeVideoId: null,
      }),
    ).toBeNull()
  })

  test("a legacy-only row becomes a YouTube video (no backfill needed)", () => {
    expect(
      resolveTemplateEmbeddedVideo({
        embeddedVideo: null,
        youtubeVideoId: YT_A,
      }),
    ).toEqual(youtube(YT_A))
  })

  test("a legacy-only row with a malformed or empty id has no video", () => {
    for (const bad of ["", "short", "has space!!", "videoseries"]) {
      expect(
        resolveTemplateEmbeddedVideo({
          embeddedVideo: null,
          youtubeVideoId: bad,
        }),
      ).toBeNull()
    }
  })

  test("broken embeddedVideo JSON counts as absent and never throws", () => {
    for (const broken of [
      {},
      "x",
      5,
      [],
      { provider: "youtube" },
      { provider: "other", videoId: "1" },
    ]) {
      expect(
        resolveTemplateEmbeddedVideo({
          embeddedVideo: broken,
          youtubeVideoId: null,
        }),
      ).toBeNull()
      expect(
        resolveTemplateEmbeddedVideo({
          embeddedVideo: broken,
          youtubeVideoId: YT_A,
        }),
      ).toEqual(youtube(YT_A))
    }
  })

  test("in-sync columns return embeddedVideo with its ratio", () => {
    expect(
      resolveTemplateEmbeddedVideo({
        embeddedVideo: youtube(YT_A, 0.5625),
        youtubeVideoId: YT_A,
      }),
    ).toEqual(youtube(YT_A, 0.5625))
    expect(
      resolveTemplateEmbeddedVideo({
        embeddedVideo: vimeo,
        youtubeVideoId: null,
      }),
    ).toEqual(vimeo)
  })

  test("YouTube embeddedVideo and a null legacy column: the legacy clear wins", () => {
    expect(
      resolveTemplateEmbeddedVideo({
        embeddedVideo: youtube(YT_A),
        youtubeVideoId: null,
      }),
    ).toBeNull()
  })

  test("YouTube embeddedVideo and a different valid legacy id: the legacy id wins", () => {
    expect(
      resolveTemplateEmbeddedVideo({
        embeddedVideo: youtube(YT_A, 0.5),
        youtubeVideoId: YT_B,
      }),
    ).toEqual(youtube(YT_B))
  })

  test("YouTube embeddedVideo and a malformed legacy id: embeddedVideo is kept", () => {
    for (const bad of ["", "nope", "videoseries"]) {
      expect(
        resolveTemplateEmbeddedVideo({
          embeddedVideo: youtube(YT_A, 0.5),
          youtubeVideoId: bad,
        }),
      ).toEqual(youtube(YT_A, 0.5))
    }
  })

  test("another provider and a valid legacy id: the legacy YouTube video wins", () => {
    expect(
      resolveTemplateEmbeddedVideo({
        embeddedVideo: vimeo,
        youtubeVideoId: YT_A,
      }),
    ).toEqual(youtube(YT_A))
  })

  test("another provider and a null or malformed legacy column: embeddedVideo is kept", () => {
    for (const legacy of [null, "", "nope"]) {
      expect(
        resolveTemplateEmbeddedVideo({
          embeddedVideo: vimeo,
          youtubeVideoId: legacy,
        }),
      ).toEqual(vimeo)
    }
  })
})

describe("toTemplateVideoProjection", () => {
  test("a YouTube row gives the view and the derived legacy id", () => {
    const projection = toTemplateVideoProjection({
      embeddedVideo: youtube(YT_A, 1.7),
      youtubeVideoId: YT_A,
    })
    expect(projection.youtubeVideoId).toBe(YT_A)
    expect(projection.video?.provider).toBe("youtube")
  })

  test("another provider has no legacy id; no video is null on both", () => {
    expect(
      toTemplateVideoProjection({ embeddedVideo: vimeo, youtubeVideoId: null }),
    ).toMatchObject({ youtubeVideoId: null, video: { provider: "vimeo" } })
    expect(
      toTemplateVideoProjection({ embeddedVideo: null, youtubeVideoId: null }),
    ).toEqual({ video: null, youtubeVideoId: null })
  })
})
