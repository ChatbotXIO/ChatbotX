import { describe, expect, test } from "vitest"
import {
  EMBEDDED_VIDEO_PARSE_FAILURE_REASONS,
  EMBEDDED_VIDEO_SOURCE_MAX_LENGTH,
  type EmbeddedVideo,
  type EmbeddedVideoParseFailureReason,
  embeddedVideoSchema,
  embeddedVideoViewSchema,
  fromYoutubeVideoId,
  isSameEmbeddedVideo,
  parseEmbeddedVideoSource,
  toEmbeddedVideoAspectRatio,
  toEmbeddedVideoView,
} from "../src/embedded-video"

const YT = "dQw4w9WgXcQ"
const SHORT = "2CkofPRY3V4"

const parseOk = (input: string) => {
  const result = parseEmbeddedVideoSource(input)
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.reason} for ${input}`)
  }
  return result
}

const youtube = (videoId: string, aspectRatio: number | null = null) =>
  ({ provider: "youtube", videoId, aspectRatio }) satisfies EmbeddedVideo

const OEMBED_YOUTUBE =
  '<iframe width="200" height="113" src="https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed" frameborder="0" allow="accelerometer; autoplay" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="x"></iframe>'
const OEMBED_SHORT =
  '<iframe width="113" height="200" src="https://www.youtube.com/embed/2CkofPRY3V4?feature=oembed" frameborder="0" allowfullscreen></iframe>'
const OEMBED_VIMEO_UNLISTED =
  '<iframe src="https://player.vimeo.com/video/1085116418?h=ad0e59b079&amp;app_id=122963" width="320" height="240" frameborder="0" allow="autoplay" title="Use Cases Animation"></iframe>'
const STREAMABLE_EMBED =
  '<iframe class="streamable-embed" src="https://streamable.com/o/hn8hq" frameborder="0" scrolling="no" width="1280" height="720" allowfullscreen></iframe>'
const CLOUDINARY_EMBED = `<iframe
src="https://player.cloudinary.com/embed/?cloud_name=demo&public_id=elephants"
width="640"
height="360"
style="height: auto; width: 100%; aspect-ratio: 640 / 360;"
allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
allowfullscreen
frameborder="0"
></iframe>`

describe("parseEmbeddedVideoSource: accepted sources", () => {
  const accepted: [string, string, EmbeddedVideo, number | null][] = [
    [
      "youtube watch",
      `https://www.youtube.com/watch?v=${YT}`,
      youtube(YT),
      null,
    ],
    [
      "youtube short link + si",
      `https://youtu.be/${YT}?si=abc`,
      youtube(YT),
      null,
    ],
    ["youtube m.", `https://m.youtube.com/watch?v=${YT}`, youtube(YT), null],
    [
      "youtube music.",
      `https://music.youtube.com/watch?v=${YT}`,
      youtube(YT),
      null,
    ],
    [
      "youtube bare host + extras",
      `https://youtube.com/watch?v=${YT}&t=10s&list=x`,
      youtube(YT),
      null,
    ],
    ["youtube embed", `https://www.youtube.com/embed/${YT}`, youtube(YT), null],
    [
      "youtube nocookie",
      `https://www.youtube-nocookie.com/embed/${YT}`,
      youtube(YT),
      null,
    ],
    ["youtube live", `https://www.youtube.com/live/${YT}`, youtube(YT), null],
    [
      "youtube shorts hint",
      `https://www.youtube.com/shorts/${SHORT}`,
      youtube(SHORT, 9 / 16),
      9 / 16,
    ],
    [
      "vimeo plain",
      "https://vimeo.com/76979871",
      { provider: "vimeo", videoId: "76979871", aspectRatio: null },
      null,
    ],
    [
      "vimeo www",
      "https://www.vimeo.com/76979871",
      { provider: "vimeo", videoId: "76979871", aspectRatio: null },
      null,
    ],
    [
      "vimeo channels",
      "https://vimeo.com/channels/staffpicks/76979871",
      { provider: "vimeo", videoId: "76979871", aspectRatio: null },
      null,
    ],
    [
      "vimeo unlisted path hash",
      "https://vimeo.com/1085116418/ad0e59b079",
      {
        provider: "vimeo",
        videoId: "1085116418",
        privacyHash: "ad0e59b079",
        aspectRatio: null,
      },
      null,
    ],
    [
      "vimeo player ?h=",
      "https://player.vimeo.com/video/1085116418?h=ad0e59b079",
      {
        provider: "vimeo",
        videoId: "1085116418",
        privacyHash: "ad0e59b079",
        aspectRatio: null,
      },
      null,
    ],
    [
      "vimeo player plain",
      "https://player.vimeo.com/video/76979871",
      { provider: "vimeo", videoId: "76979871", aspectRatio: null },
      null,
    ],
    [
      "streamable plain",
      "https://streamable.com/hn8hq",
      { provider: "streamable", videoId: "hn8hq", aspectRatio: null },
      null,
    ],
    [
      "streamable /e/",
      "https://streamable.com/e/hn8hq",
      { provider: "streamable", videoId: "hn8hq", aspectRatio: null },
      null,
    ],
    [
      "streamable /o/",
      "https://streamable.com/o/o1ioj2",
      { provider: "streamable", videoId: "o1ioj2", aspectRatio: null },
      null,
    ],
    [
      "cloudinary player url",
      "https://player.cloudinary.com/embed/?cloud_name=colbycloud-examples&public_id=videos/guitar",
      {
        provider: "cloudinary",
        cloudName: "colbycloud-examples",
        asset: { kind: "player", publicId: "videos/guitar" },
        aspectRatio: null,
      },
      null,
    ],
    [
      "cloudinary file mp4",
      "https://res.cloudinary.com/demo/video/upload/dog.mp4",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "file", path: "dog.mp4" },
        aspectRatio: null,
      },
      null,
    ],
    [
      "cloudinary file versioned",
      "https://res.cloudinary.com/demo/video/upload/v1699999999/dog.mp4",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "file", path: "v1699999999/dog.mp4" },
        aspectRatio: null,
      },
      null,
    ],
    [
      "cloudinary file webm folder",
      "https://res.cloudinary.com/demo/video/upload/samples/elephants.webm",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "file", path: "samples/elephants.webm" },
        aspectRatio: null,
      },
      null,
    ],
  ]

  test.each(accepted)("%s", (_name, input, video, hinted) => {
    const result = parseOk(input)
    expect(result.video).toEqual(video)
    expect(result.hintedAspectRatio).toBe(hinted)
  })

  test("trims surrounding whitespace", () => {
    expect(parseOk(`  https://youtu.be/${YT}\n`).video).toEqual(youtube(YT))
  })
})

describe("parseEmbeddedVideoSource: embed code", () => {
  test("youtube oembed html: ratio from width/height", () => {
    const result = parseOk(OEMBED_YOUTUBE)
    expect(result.video).toEqual(youtube(YT, 200 / 113))
    expect(result.hintedAspectRatio).toBeCloseTo(1.7699, 3)
  })

  test("youtube short html: portrait ratio", () => {
    expect(parseOk(OEMBED_SHORT).hintedAspectRatio).toBeCloseTo(0.565, 3)
  })

  test("vimeo unlisted html: decodes &amp;, keeps h, drops app_id", () => {
    const { video } = parseOk(OEMBED_VIMEO_UNLISTED)
    expect(video).toMatchObject({
      videoId: "1085116418",
      privacyHash: "ad0e59b079",
    })
    expect(toEmbeddedVideoView(video).playback).toEqual({
      kind: "iframe",
      src: "https://player.vimeo.com/video/1085116418?h=ad0e59b079",
      allow: expect.stringContaining("web-share"),
    })
  })

  test("streamable html", () => {
    const result = parseOk(STREAMABLE_EMBED)
    expect(result.video).toMatchObject({
      provider: "streamable",
      videoId: "hn8hq",
    })
    expect(result.hintedAspectRatio).toBeCloseTo(16 / 9, 5)
  })

  test("cloudinary official multi-line snippet", () => {
    const result = parseOk(CLOUDINARY_EMBED)
    expect(result.video).toEqual({
      provider: "cloudinary",
      cloudName: "demo",
      asset: { kind: "player", publicId: "elephants" },
      aspectRatio: 640 / 360,
    })
  })

  test("uses only the first iframe", () => {
    const second = '<iframe src="https://vimeo.com/76979871"></iframe>'
    expect(parseOk(OEMBED_YOUTUBE + second).video.provider).toBe("youtube")
  })

  test("single-quoted attributes and data-src are handled", () => {
    const html = `<iframe data-src="https://vimeo.com/1" src='https://streamable.com/abc12'></iframe>`
    expect(parseOk(html).video).toMatchObject({
      provider: "streamable",
      videoId: "abc12",
    })
  })

  test("a > inside an attribute value does not truncate the tag", () => {
    const html = `<iframe title="a > b" width="400" height="300" src="https://streamable.com/abc12"></iframe>`
    expect(parseOk(html).hintedAspectRatio).toBeCloseTo(4 / 3, 5)
  })

  test("embed code ratio wins over a Shorts hint", () => {
    const html = `<iframe width="200" height="100" src="https://www.youtube.com/shorts/${SHORT}"></iframe>`
    expect(parseOk(html).hintedAspectRatio).toBe(2)
  })

  test("percentage / missing / out-of-range sizes give no ratio", () => {
    const withSize = (w: string, h: string) =>
      `<iframe width="${w}" height="${h}" src="https://streamable.com/abc12"></iframe>`
    expect(parseOk(withSize("100%", "100%")).hintedAspectRatio).toBeNull()
    expect(parseOk(withSize("0", "10")).hintedAspectRatio).toBeNull()
    expect(parseOk(withSize("1000", "10")).hintedAspectRatio).toBe(4)
    expect(parseOk(withSize("10", "1000")).hintedAspectRatio).toBe(0.25)
    expect(
      parseOk('<iframe src="https://streamable.com/abc12"></iframe>')
        .hintedAspectRatio,
    ).toBeNull()
  })
})

describe("parseEmbeddedVideoSource: rejections", () => {
  const rejected: [string, string, EmbeddedVideoParseFailureReason][] = [
    ["empty", "", "invalidUrl"],
    ["whitespace", "   ", "invalidUrl"],
    ["not a url", "hello world", "invalidUrl"],
    ["http", `http://www.youtube.com/watch?v=${YT}`, "invalidUrl"],
    ["javascript:", "javascript:alert(1)", "invalidUrl"],
    ["data:", "data:text/html,<iframe src=x>", "invalidUrl"],
    ["userinfo", `https://user:pw@www.youtube.com/watch?v=${YT}`, "invalidUrl"],
    [
      "userinfo trick",
      `https://www.youtube.com@evil.com/watch?v=${YT}`,
      "invalidUrl",
    ],
    ["port", `https://www.youtube.com:8443/watch?v=${YT}`, "invalidUrl"],
    [
      "iframe without src",
      '<iframe width="1" height="1"></iframe>',
      "invalidUrl",
    ],
    [
      "html without iframe",
      "<div>https://youtu.be/dQw4w9WgXcQ</div>",
      "invalidUrl",
    ],
    [
      "undecodable entity src",
      '<iframe src="https&#x3A;//youtu.be/dQw4w9WgXcQ"></iframe>',
      "invalidUrl",
    ],
    [
      "lookalike suffix",
      `https://www.youtube.com.evil.com/watch?v=${YT}`,
      "unsupportedProvider",
    ],
    [
      "lookalike prefix",
      `https://evilyoutube.com/watch?v=${YT}`,
      "unsupportedProvider",
    ],
    [
      "trailing-dot host",
      `https://youtube.com./watch?v=${YT}`,
      "unsupportedProvider",
    ],
    ["other provider", "https://example.com/video/1", "unsupportedProvider"],
    [
      "www streamable",
      "https://www.streamable.com/hn8hq",
      "unsupportedProvider",
    ],
    ["yt bad id", "https://www.youtube.com/watch?v=BADID", "invalidVideoId"],
    ["yt no id", "https://www.youtube.com/", "invalidVideoId"],
    ["yt 12-char id", "https://youtu.be/dQw4w9WgXcQx", "invalidVideoId"],
    ["vimeo non numeric", "https://vimeo.com/abc", "invalidVideoId"],
    ["vimeo bad hash", "https://vimeo.com/76979871/XYZ", "invalidVideoId"],
    [
      "vimeo extra path",
      "https://vimeo.com/76979871/ad0e59b079/x",
      "invalidVideoId",
    ],
    [
      "vimeo player bad path",
      "https://player.vimeo.com/76979871",
      "invalidVideoId",
    ],
    ["streamable too deep", "https://streamable.com/e/o/abc", "invalidVideoId"],
    ["streamable bad id", "https://streamable.com/a-b", "invalidVideoId"],
    [
      "cloudinary player missing public_id",
      "https://player.cloudinary.com/embed/?cloud_name=demo",
      "invalidVideoId",
    ],
    [
      "cloudinary player missing cloud_name",
      "https://player.cloudinary.com/embed/?public_id=a",
      "invalidVideoId",
    ],
    [
      "cloudinary bad cloud name",
      "https://player.cloudinary.com/embed/?cloud_name=1demo&public_id=a",
      "invalidVideoId",
    ],
    [
      "cloudinary traversal public_id",
      "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=a/../b",
      "invalidVideoId",
    ],
    [
      "cloudinary empty segment",
      "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=a//b",
      "invalidVideoId",
    ],
    [
      "cloudinary non-ascii public_id",
      "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=vidéo",
      "invalidVideoId",
    ],
    [
      "cloudinary forbidden char",
      "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=a%25b",
      "invalidVideoId",
    ],
    [
      "cloudinary wrong player path",
      "https://player.cloudinary.com/other/?cloud_name=demo&public_id=a",
      "invalidVideoId",
    ],
    [
      "cloudinary transformation",
      "https://res.cloudinary.com/demo/video/upload/c_scale,w_200/dog.mp4",
      "invalidVideoId",
    ],
    [
      "cloudinary image",
      "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      "invalidVideoId",
    ],
    [
      "cloudinary no extension",
      "https://res.cloudinary.com/demo/video/upload/dog",
      "invalidVideoId",
    ],
    [
      "cloudinary bad extension",
      "https://res.cloudinary.com/demo/video/upload/dog.avi",
      "invalidVideoId",
    ],
    [
      "cloudinary mov (mp4|webm only)",
      "https://res.cloudinary.com/demo/video/upload/dog.mov",
      "invalidVideoId",
    ],
    [
      "youtube playlist embed url",
      "https://www.youtube.com/embed/videoseries?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG",
      "invalidVideoId",
    ],
    [
      "youtube playlist embed iframe",
      '<iframe width="560" height="315" src="https://www.youtube.com/embed/videoseries?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG" allowfullscreen></iframe>',
      "invalidVideoId",
    ],
    [
      "src hidden inside another attribute value",
      `<iframe title="x src='https://youtu.be/${YT}'" src="https://evil.com/"></iframe>`,
      "unsupportedProvider",
    ],
    [
      "cloudinary lone version",
      "https://res.cloudinary.com/demo/video/upload/v123",
      "invalidVideoId",
    ],
    [
      "cloudinary traversal file",
      "https://res.cloudinary.com/demo/video/upload/../dog.mp4",
      "invalidVideoId",
    ],
  ]

  test.each(rejected)("%s", (_name, input, reason) => {
    expect(parseEmbeddedVideoSource(input)).toEqual({ ok: false, reason })
  })

  test("over the length cap is tooLong, exactly at the cap is not", () => {
    const pad = (n: number) => `https://youtu.be/${YT}?${"a".repeat(n)}`
    const limit = EMBEDDED_VIDEO_SOURCE_MAX_LENGTH
    const exact = pad(limit - `https://youtu.be/${YT}?`.length)
    expect(exact).toHaveLength(limit)
    expect(parseEmbeddedVideoSource(exact).ok).toBe(true)
    expect(parseEmbeddedVideoSource(`${exact}a`)).toEqual({
      ok: false,
      reason: "tooLong",
    })
  })

  test("reason codes are the documented stable set", () => {
    expect(EMBEDDED_VIDEO_PARSE_FAILURE_REASONS).toEqual([
      "tooLong",
      "invalidUrl",
      "unsupportedProvider",
      "invalidVideoId",
    ])
  })
})

describe("toEmbeddedVideoView", () => {
  const view = (input: string) => toEmbeddedVideoView(parseOk(input).video)

  test("youtube: rebuilt nocookie src, dropped query, canonical source", () => {
    expect(view(`https://youtu.be/${YT}?si=abc&t=3`)).toEqual({
      provider: "youtube",
      source: `https://www.youtube.com/watch?v=${YT}`,
      aspectRatio: 16 / 9,
      playback: {
        kind: "iframe",
        src: `https://www.youtube-nocookie.com/embed/${YT}`,
        allow:
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
      },
    })
  })

  test("portrait youtube source is /shorts/ and re-parses with the same ratio", () => {
    const shorts = view(`https://www.youtube.com/shorts/${SHORT}`)
    expect(shorts.source).toBe(`https://www.youtube.com/shorts/${SHORT}`)
    const echoed = parseOk(shorts.source)
    expect(echoed.video).toEqual(youtube(SHORT, 9 / 16))
    expect(toEmbeddedVideoView(echoed.video)).toEqual(shorts)
  })

  test("a non-9:16 portrait youtube source is /watch and re-parses without a hint", () => {
    for (const ratio of [0.75, 113 / 200]) {
      const { source } = toEmbeddedVideoView(youtube(SHORT, ratio))
      expect(source).toBe(`https://www.youtube.com/watch?v=${SHORT}`)
      expect(parseOk(source).hintedAspectRatio).toBeNull()
    }
    expect(toEmbeddedVideoView(youtube(SHORT, 9 / 16)).source).toBe(
      `https://www.youtube.com/shorts/${SHORT}`,
    )
  })

  test("landscape or unknown-ratio youtube source is /watch", () => {
    expect(toEmbeddedVideoView(youtube(YT, 16 / 9)).source).toBe(
      `https://www.youtube.com/watch?v=${YT}`,
    )
    expect(toEmbeddedVideoView(youtube(YT)).source).toBe(
      `https://www.youtube.com/watch?v=${YT}`,
    )
  })

  test("youtube shorts keep the 9/16 ratio", () => {
    expect(view(`https://www.youtube.com/shorts/${SHORT}`).aspectRatio).toBe(
      9 / 16,
    )
  })

  test("vimeo public and unlisted", () => {
    expect(view("https://vimeo.com/76979871?foo=bar")).toMatchObject({
      source: "https://vimeo.com/76979871",
      playback: { src: "https://player.vimeo.com/video/76979871" },
    })
    expect(view("https://vimeo.com/1085116418/ad0e59b079")).toMatchObject({
      source: "https://vimeo.com/1085116418/ad0e59b079",
      playback: {
        src: "https://player.vimeo.com/video/1085116418?h=ad0e59b079",
        allow:
          "autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share",
      },
    })
  })

  test("streamable: /o/ src and fullscreen allow, from any input shape", () => {
    for (const input of [
      "https://streamable.com/hn8hq",
      "https://streamable.com/e/hn8hq",
    ]) {
      expect(view(input)).toMatchObject({
        source: "https://streamable.com/hn8hq",
        playback: {
          kind: "iframe",
          src: "https://streamable.com/o/hn8hq",
          allow: "fullscreen",
        },
      })
    }
  })

  test("cloudinary player encodes the public id; file plays directly", () => {
    expect(view(CLOUDINARY_EMBED).playback).toEqual({
      kind: "iframe",
      src: "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=elephants",
      allow: "autoplay; fullscreen; encrypted-media; picture-in-picture",
    })
    expect(
      view(
        "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=videos/guitar&vpv=1.4.0",
      ).playback,
    ).toMatchObject({
      src: "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=videos%2Fguitar",
    })
    expect(
      view("https://res.cloudinary.com/demo/video/upload/v1699999999/dog.mp4"),
    ).toMatchObject({
      source:
        "https://res.cloudinary.com/demo/video/upload/v1699999999/dog.mp4",
      playback: {
        kind: "file",
        src: "https://res.cloudinary.com/demo/video/upload/v1699999999/dog.mp4",
      },
    })
  })

  test("every view satisfies embeddedVideoViewSchema", () => {
    for (const input of [
      `https://youtu.be/${YT}`,
      "https://vimeo.com/76979871",
      "https://streamable.com/hn8hq",
      CLOUDINARY_EMBED,
      "https://res.cloudinary.com/demo/video/upload/dog.mp4",
    ]) {
      expect(embeddedVideoViewSchema.safeParse(view(input)).success).toBe(true)
    }
  })
})

describe("isSameEmbeddedVideo", () => {
  test("watch and shorts links of one id are the same video", () => {
    expect(
      isSameEmbeddedVideo(
        parseOk(`https://www.youtube.com/shorts/${SHORT}`).video,
        parseOk(`https://www.youtube.com/watch?v=${SHORT}`).video,
      ),
    ).toBe(true)
    expect(isSameEmbeddedVideo(youtube(SHORT, 0.5), youtube(SHORT, 2))).toBe(
      true,
    )
  })

  test("ignores aspectRatio and link shape", () => {
    expect(isSameEmbeddedVideo(youtube(YT), youtube(YT, 0.5))).toBe(true)
    expect(
      isSameEmbeddedVideo(
        parseOk(`https://youtu.be/${YT}`).video,
        parseOk(`https://www.youtube.com/embed/${YT}`).video,
      ),
    ).toBe(true)
  })

  test("differs by id, hash, provider and cloudinary asset kind", () => {
    expect(isSameEmbeddedVideo(youtube(YT), youtube(SHORT))).toBe(false)
    const vimeo = (url: string) => parseOk(url).video
    expect(
      isSameEmbeddedVideo(
        vimeo("https://vimeo.com/1"),
        vimeo("https://vimeo.com/1/abc"),
      ),
    ).toBe(false)
    expect(
      isSameEmbeddedVideo(
        vimeo("https://streamable.com/abc12"),
        vimeo("https://vimeo.com/12"),
      ),
    ).toBe(false)
    expect(
      isSameEmbeddedVideo(
        vimeo(
          "https://player.cloudinary.com/embed/?cloud_name=demo&public_id=dog.mp4",
        ),
        vimeo("https://res.cloudinary.com/demo/video/upload/dog.mp4"),
      ),
    ).toBe(false)
  })
})

describe("embeddedVideoSchema", () => {
  test("accepts every parsed value (round trip)", () => {
    for (const input of [
      `https://www.youtube.com/shorts/${SHORT}`,
      "https://vimeo.com/1085116418/ad0e59b079",
      "https://streamable.com/hn8hq",
      CLOUDINARY_EMBED,
      "https://res.cloudinary.com/demo/video/upload/dog.mp4",
    ]) {
      const { video } = parseOk(input)
      expect(embeddedVideoSchema.safeParse(video)).toEqual({
        success: true,
        data: video,
      })
    }
  })

  test.each([
    ["null", null],
    [
      "youtube videoseries",
      { provider: "youtube", videoId: "videoseries", aspectRatio: null },
    ],
    [
      "cloudinary cloudName with slash",
      {
        provider: "cloudinary",
        cloudName: "evil.com/x",
        asset: { kind: "player", publicId: "a" },
        aspectRatio: null,
      },
    ],
    [
      "cloudinary cloudName with query",
      {
        provider: "cloudinary",
        cloudName: "demo?x=",
        asset: { kind: "player", publicId: "a" },
        aspectRatio: null,
      },
    ],
    [
      "cloudinary publicId ?",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "player", publicId: "a?b" },
        aspectRatio: null,
      },
    ],
    [
      "cloudinary publicId #",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "player", publicId: "a#b" },
        aspectRatio: null,
      },
    ],
    [
      "vimeo videoId traversal",
      { provider: "vimeo", videoId: "1/../x", aspectRatio: null },
    ],
    [
      "vimeo hash with &",
      {
        provider: "vimeo",
        videoId: "1",
        privacyHash: "ab&x=1",
        aspectRatio: null,
      },
    ],
    [
      "streamable videoId slash",
      { provider: "streamable", videoId: "a/b", aspectRatio: null },
    ],
    [
      "cloudinary file ..",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "file", path: "a/../b.mp4" },
        aspectRatio: null,
      },
    ],
    [
      "cloudinary file ?",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "file", path: "a?x.mp4" },
        aspectRatio: null,
      },
    ],
    [
      "cloudinary file .mov",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "file", path: "dog.mov" },
        aspectRatio: null,
      },
    ],
    [
      "unknown provider",
      { provider: "dailymotion", videoId: "x", aspectRatio: null },
    ],
    [
      "bad youtube id",
      { provider: "youtube", videoId: "short", aspectRatio: null },
    ],
    [
      "ratio out of range",
      { provider: "youtube", videoId: YT, aspectRatio: 10 },
    ],
    ["missing ratio", { provider: "youtube", videoId: YT }],
    [
      "bad vimeo hash",
      { provider: "vimeo", videoId: "1", privacyHash: "ZZ", aspectRatio: null },
    ],
    [
      "cloudinary traversal",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "file", path: "../x.mp4" },
        aspectRatio: null,
      },
    ],
    [
      "cloudinary file without extension",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "file", path: "dog" },
        aspectRatio: null,
      },
    ],
    [
      "cloudinary unknown asset kind",
      {
        provider: "cloudinary",
        cloudName: "demo",
        asset: { kind: "html", path: "x" },
        aspectRatio: null,
      },
    ],
  ])("rejects %s", (_name, value) => {
    expect(embeddedVideoSchema.safeParse(value).success).toBe(false)
  })
})

describe("fromYoutubeVideoId", () => {
  test("valid id becomes a youtube video without a ratio", () => {
    expect(fromYoutubeVideoId(YT)).toEqual(youtube(YT))
  })

  test.each([
    [""],
    ["videoseries"],
    [" "],
    ["short"],
    [`${YT}x`],
    ["bad id!!!!!!"],
    [null],
    [undefined],
  ])("%j -> null", (id) => {
    expect(fromYoutubeVideoId(id)).toBeNull()
  })
})

describe("toEmbeddedVideoAspectRatio", () => {
  test.each([
    [16, 9, 16 / 9],
    [9, 16, 9 / 16],
    [4, 1, 4],
    [1, 4, 0.25],
    [5, 1, 4],
    [1, 5, 0.25],
  ])("%d x %d", (w, h, expected) => {
    expect(toEmbeddedVideoAspectRatio(w, h)).toBe(expected)
  })

  test.each([
    [0, 5],
    [5, 0],
    [-1, 5],
    [Number.NaN, 5],
    [5, Number.POSITIVE_INFINITY],
  ])("%d x %d -> null", (w, h) => {
    expect(toEmbeddedVideoAspectRatio(w, h)).toBeNull()
  })
})
