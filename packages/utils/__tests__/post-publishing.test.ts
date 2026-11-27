import { describe, expect, test } from "vitest"
import {
  captionWithLink,
  describePublishingRules,
  enabledContentTypes,
  type MediaSpec,
  normalisePublishTarget,
  type PostIssueCode,
  publisherCanRemove,
  ruleFor,
} from "../src/post-publishing"
import type { SocialContentType, SocialProvider } from "../src/social-account"

const MEGABYTE = 1024 * 1024

const image = (overrides: Partial<MediaSpec> = {}): MediaSpec => ({
  durationMs: null,
  kind: "image",
  mimeType: "image/jpeg",
  size: MEGABYTE,
  ...overrides,
})
const video = (overrides: Partial<MediaSpec> = {}): MediaSpec => ({
  durationMs: 30_000,
  kind: "video",
  mimeType: "video/mp4",
  size: 10 * MEGABYTE,
  ...overrides,
})

const codes = (input: {
  contentType: SocialContentType
  linkUrl?: string | null
  media?: MediaSpec[]
  options?: unknown
  provider: SocialProvider
  text?: string | null
}): PostIssueCode[] =>
  normalisePublishTarget({
    linkUrl: null,
    media: [],
    options: {},
    text: null,
    ...input,
  }).issues.map((issue) => issue.code)

describe("publishing rules per network", () => {
  test.each<[string, Parameters<typeof codes>[0], PostIssueCode[]]>([
    [
      "threads text within 500 characters",
      { contentType: "text", provider: "threads", text: "a".repeat(500) },
      [],
    ],
    [
      "threads text over 500 characters",
      { contentType: "text", provider: "threads", text: "a".repeat(501) },
      ["textTooLong"],
    ],
    [
      "threads text without text",
      { contentType: "text", provider: "threads" },
      ["textRequired"],
    ],
    [
      "threads image 8 MB png",
      {
        contentType: "image",
        media: [image({ mimeType: "image/png", size: 8 * MEGABYTE })],
        provider: "threads",
      },
      [],
    ],
    [
      "threads image over 8 MB",
      {
        contentType: "image",
        media: [image({ size: 8 * MEGABYTE + 1 })],
        provider: "threads",
      },
      ["mediaTooLarge"],
    ],
    [
      "threads image webp",
      {
        contentType: "image",
        media: [image({ mimeType: "image/webp" })],
        provider: "threads",
      },
      ["mediaFormatNotSupported"],
    ],
    [
      "threads video over 5 minutes",
      {
        contentType: "video",
        media: [video({ durationMs: 301_000 })],
        provider: "threads",
      },
      ["mediaTooLong"],
    ],
    [
      "threads carousel of one file",
      { contentType: "carousel", media: [image()], provider: "threads" },
      ["mediaTooFew"],
    ],
    [
      "threads carousel of 20 files",
      {
        contentType: "carousel",
        media: Array.from({ length: 20 }, () => image()),
        provider: "threads",
      },
      [],
    ],
    [
      "threads carousel of 21 files",
      {
        contentType: "carousel",
        media: Array.from({ length: 21 }, () => image()),
        provider: "threads",
      },
      ["mediaTooMany"],
    ],
    [
      "threads takes a link in the caption",
      {
        contentType: "text",
        linkUrl: "https://example.com",
        provider: "threads",
        text: "hi",
      },
      [],
    ],
    [
      "instagram image needs jpeg",
      {
        contentType: "image",
        media: [image({ mimeType: "image/png" })],
        provider: "instagram",
      },
      ["mediaFormatNotSupported"],
    ],
    [
      "instagram image jpeg within 8 MB",
      { contentType: "image", media: [image()], provider: "instagram" },
      [],
    ],
    [
      "instagram image needs a file",
      { contentType: "image", provider: "instagram", text: "caption" },
      ["mediaTooFew"],
    ],
    [
      "instagram reel 3 seconds",
      {
        contentType: "reel",
        media: [video({ durationMs: 3000 })],
        provider: "instagram",
      },
      [],
    ],
    [
      "instagram reel under 3 seconds",
      {
        contentType: "reel",
        media: [video({ durationMs: 2000 })],
        provider: "instagram",
      },
      ["mediaTooShort"],
    ],
    [
      "instagram reel over 300 MB",
      {
        contentType: "reel",
        media: [video({ size: 300 * MEGABYTE + 1 })],
        provider: "instagram",
      },
      ["mediaTooLarge"],
    ],
    [
      "instagram reel setting",
      {
        contentType: "reel",
        media: [video()],
        options: { shareToFeed: false },
        provider: "instagram",
      },
      [],
    ],
    [
      "instagram reel unknown setting",
      {
        contentType: "reel",
        media: [video()],
        options: { bogus: true },
        provider: "instagram",
      },
      ["optionsInvalid"],
    ],
    [
      "instagram story video over 60 seconds",
      {
        contentType: "story",
        media: [video({ durationMs: 61_000 })],
        provider: "instagram",
      },
      ["mediaTooLong"],
    ],
    [
      "instagram story video over 100 MB",
      {
        contentType: "story",
        media: [video({ size: 100 * MEGABYTE + 1 })],
        provider: "instagram",
      },
      ["mediaTooLarge"],
    ],
    [
      "instagram does not publish plain text",
      { contentType: "text", provider: "instagram", text: "hi" },
      ["contentTypeNotSupported"],
    ],
    [
      "facebook text",
      { contentType: "text", provider: "facebook", text: "hello" },
      [],
    ],
    [
      "facebook text needs text",
      { contentType: "text", provider: "facebook" },
      ["textRequired"],
    ],
    [
      "facebook link with a link only",
      {
        contentType: "link",
        linkUrl: "https://example.com",
        provider: "facebook",
      },
      [],
    ],
    [
      "facebook link without a link",
      { contentType: "link", provider: "facebook", text: "hi" },
      ["linkRequired"],
    ],
    [
      "facebook link that is not http",
      {
        contentType: "link",
        linkUrl: "ftp://example.com",
        provider: "facebook",
        text: "hi",
      },
      ["linkRequired"],
    ],
    [
      "facebook reel over 90 seconds",
      {
        contentType: "reel",
        media: [video({ durationMs: 91_000 })],
        provider: "facebook",
      },
      ["mediaTooLong"],
    ],
    [
      "facebook image with a video",
      { contentType: "image", media: [video()], provider: "facebook" },
      ["mediaKindNotAllowed"],
    ],
    [
      "facebook feed image over 4 MB",
      {
        contentType: "image",
        media: [image({ size: 4 * MEGABYTE + 1 })],
        provider: "facebook",
      },
      ["mediaTooLarge"],
    ],
    [
      "facebook feed image of exactly 4 MB",
      {
        contentType: "image",
        media: [image({ size: 4 * MEGABYTE })],
        provider: "facebook",
      },
      [],
    ],
    [
      "facebook multi-photo image over 4 MB",
      {
        contentType: "carousel",
        media: [image(), image({ size: 4 * MEGABYTE + 1 })],
        provider: "facebook",
      },
      ["mediaTooLarge"],
    ],
    [
      "facebook story photo up to 10 MB",
      {
        contentType: "story",
        media: [image({ size: 10 * MEGABYTE })],
        provider: "facebook",
      },
      [],
    ],
    [
      "facebook story photo over 10 MB",
      {
        contentType: "story",
        media: [image({ size: 10 * MEGABYTE + 1 })],
        provider: "facebook",
      },
      ["mediaTooLarge"],
    ],
    [
      "tiktok photos are not offered (URL ownership cannot be guaranteed)",
      { contentType: "image", media: [video()], provider: "tiktok" },
      ["contentTypeDisabled"],
    ],
  ])("%s", (_name, input, expected) => {
    expect(codes(input)).toEqual(expected)
  })
})

describe("normalisePublishTarget", () => {
  test("trims text and link and turns blanks into null", () => {
    const result = normalisePublishTarget({
      contentType: "text",
      linkUrl: "  ",
      media: [],
      options: undefined,
      provider: "threads",
      text: "  hi  ",
    })
    expect(result.text).toBe("hi")
    expect(result.linkUrl).toBeNull()
  })

  test("applies the defaults of the settings", () => {
    const result = normalisePublishTarget({
      contentType: "reel",
      linkUrl: null,
      media: [video()],
      options: {},
      provider: "instagram",
      text: null,
    })
    expect(result.options).toEqual({ shareToFeed: true, thumbOffsetMs: 0 })
  })

  test("reports every issue at once, not just the first", () => {
    const result = normalisePublishTarget({
      contentType: "image",
      linkUrl: "https://example.com",
      media: [image({ mimeType: "image/png", size: 9 * MEGABYTE })],
      options: {},
      provider: "instagram",
      text: null,
    })
    expect(result.issues.map((issue) => issue.code).sort()).toEqual(
      ["mediaFormatNotSupported", "mediaTooLarge"].sort(),
    )
  })

  test("a file of unknown type or size is not rejected", () => {
    expect(
      codes({
        contentType: "image",
        media: [
          { durationMs: null, kind: "image", mimeType: null, size: null },
        ],
        provider: "instagram",
      }),
    ).toEqual([])
  })
})

describe("the registry as data", () => {
  test("every network has the daily limit the platform documents, or none", () => {
    const limits = Object.fromEntries(
      describePublishingRules().map((rules) => [
        rules.provider,
        rules.dailyPostLimit,
      ]),
    )
    expect(limits).toEqual({
      facebook: null,
      instagram: 100,
      threads: 250,
      tiktok: null,
    })
  })

  test("a Threads text with more than five unique links is refused", () => {
    const links = [1, 2, 3, 4, 5, 6].map((n) => `https://a.example/${n}`)
    expect(
      codes({
        contentType: "text",
        provider: "threads",
        text: links.join(" "),
      }),
    ).toContain("tooManyLinks")
    expect(
      codes({
        contentType: "text",
        provider: "threads",
        text: links.slice(0, 5).join(" "),
      }),
    ).not.toContain("tooManyLinks")
  })

  test("six bare www links are refused on Threads", () => {
    const text = ["a", "b", "c", "d", "e", "f"]
      .map((host) => `www.${host}.example`)
      .join(" ")
    expect(codes({ contentType: "text", provider: "threads", text })).toContain(
      "tooManyLinks",
    )
  })

  test("a link attached through linkUrl counts toward the limit", () => {
    const text = [1, 2, 3, 4, 5].map((n) => `https://a.example/${n}`).join(" ")
    expect(
      codes({
        contentType: "text",
        linkUrl: "https://b.example/extra",
        provider: "threads",
        text,
      }),
    ).toContain("tooManyLinks")
  })

  test("a repeated URL counts once toward the Threads link limit", () => {
    const text = Array.from({ length: 8 }, () => "https://a.example/x").join(
      " ",
    )
    expect(
      codes({ contentType: "text", provider: "threads", text }),
    ).not.toContain("tooManyLinks")
  })

  test("other networks have no link count rule", () => {
    const text = [1, 2, 3, 4, 5, 6, 7]
      .map((n) => `https://a.example/${n}`)
      .join(" ")
    expect(
      codes({ contentType: "text", provider: "facebook", text }),
    ).not.toContain("tooManyLinks")
  })

  test("a disabled type is not offered", () => {
    expect(enabledContentTypes("tiktok")).toEqual(["video"])
    expect(ruleFor("tiktok", "image")?.enabled).toBe(false)
  })

  test("the offered types of a network are the ones it can publish", () => {
    expect(enabledContentTypes("threads")).toEqual([
      "text",
      "image",
      "video",
      "carousel",
    ])
    expect(enabledContentTypes("instagram")).toEqual([
      "image",
      "carousel",
      "reel",
      "story",
    ])
    expect(enabledContentTypes("facebook")).toEqual([
      "text",
      "link",
      "image",
      "carousel",
      "video",
      "reel",
      "story",
    ])
  })

  test("a type with settings describes its fields for the composer", () => {
    const reel = describePublishingRules()
      .find((rules) => rules.provider === "instagram")
      ?.contentTypes.find((type) => type.contentType === "reel")
    expect(reel?.optionFields).toEqual([
      {
        control: "switch",
        key: "shareToFeed",
        labelKey: "composer.options.shareToFeed",
        order: 1,
      },
      {
        control: "number",
        key: "thumbOffsetMs",
        labelKey: "composer.options.thumbOffsetMs",
        order: 2,
      },
    ])
  })

  test("which networks can take a published post down", () => {
    expect(
      Object.fromEntries(
        describePublishingRules().map((rules) => [
          rules.provider,
          rules.canRemove,
        ]),
      ),
    ).toEqual({
      facebook: true,
      instagram: true,
      threads: true,
      tiktok: false,
    })
  })

  test("Instagram can remove only through Facebook Login", () => {
    expect(publisherCanRemove("instagramFacebook")).toBe(true)
    expect(publisherCanRemove("instagram")).toBe(false)
    expect(publisherCanRemove("facebook")).toBe(true)
    expect(publisherCanRemove("threads")).toBe(true)
    expect(publisherCanRemove("tiktok")).toBe(false)
  })
})

const img = (mimeType = "image/jpeg", size = 1000): MediaSpec => ({
  durationMs: null,
  kind: "image",
  mimeType,
  size,
})
const vid = (durationMs: number | null = 10_000): MediaSpec => ({
  durationMs,
  kind: "video",
  mimeType: "video/mp4",
  size: 1000,
})

const issuesOf = (
  provider: SocialProvider,
  contentType: SocialContentType,
  media: MediaSpec[],
  extra: { options?: unknown; text?: string | null } = {},
) =>
  normalisePublishTarget({
    contentType,
    linkUrl: null,
    media,
    options: extra.options ?? {},
    provider,
    text: extra.text ?? null,
  }).issues.map((issue) => issue.code)

describe("rich media limits (documented values only)", () => {
  test("Instagram carousel takes up to 20 files, images and videos mixed", () => {
    const twenty = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0 ? img() : vid(),
    )
    expect(issuesOf("instagram", "carousel", twenty)).toEqual([])
    expect(issuesOf("instagram", "carousel", [...twenty, img()])).toEqual([
      "mediaTooMany",
    ])
  })

  test("Instagram caption is capped at 2,200 characters, a story carries no text", () => {
    expect(
      issuesOf("instagram", "image", [img()], { text: "a".repeat(2200) }),
    ).toEqual([])
    expect(
      issuesOf("instagram", "image", [img()], { text: "a".repeat(2201) }),
    ).toEqual(["textTooLong"])
    expect(issuesOf("instagram", "story", [img()], { text: "hi" })).toEqual([
      "textTooLong",
    ])
  })

  test("Instagram reel 3 s to 15 min, MP4 or MOV, cover offset must be a whole non-negative number", () => {
    expect(issuesOf("instagram", "reel", [vid(2000)])).toEqual([
      "mediaTooShort",
    ])
    expect(issuesOf("instagram", "reel", [vid(16 * 60_000)])).toEqual([
      "mediaTooLong",
    ])
    expect(issuesOf("instagram", "reel", [vid()])).toEqual([])
    expect(
      issuesOf("instagram", "reel", [vid()], {
        options: { thumbOffsetMs: -1 },
      }),
    ).toEqual(["optionsInvalid"])
  })

  test("an invalid setting is reported by its key", () => {
    const result = normalisePublishTarget({
      contentType: "reel",
      linkUrl: null,
      media: [vid()],
      options: { shareToFeed: "yes" },
      provider: "instagram",
      text: null,
    })
    expect(result.issues.map((issue) => issue.message)).toEqual([
      'The setting "shareToFeed" is invalid.',
    ])
    expect(result.issues[0]?.field).toBe("options")
  })

  test("Instagram story video is 3 to 60 seconds", () => {
    expect(issuesOf("instagram", "story", [vid(61_000)])).toEqual([
      "mediaTooLong",
    ])
    expect(issuesOf("instagram", "story", [vid(60_000)])).toEqual([])
  })

  test("Threads carousel needs 2 to 20 files; a video is limited to 300 s", () => {
    expect(issuesOf("threads", "carousel", [img("image/png")])).toEqual([
      "mediaTooFew",
    ])
    expect(issuesOf("threads", "carousel", [img("image/png"), vid()])).toEqual(
      [],
    )
    expect(issuesOf("threads", "video", [vid(301_000)])).toEqual([
      "mediaTooLong",
    ])
  })

  test("Facebook multi-photo takes photos only, 10 MB each, at least 2", () => {
    expect(issuesOf("facebook", "carousel", [img()])).toEqual(["mediaTooFew"])
    expect(
      issuesOf("facebook", "carousel", [img("image/gif"), img("image/png")]),
    ).toEqual([])
    expect(issuesOf("facebook", "carousel", [img(), vid()])).toEqual([
      "mediaKindNotAllowed",
    ])
    expect(
      issuesOf("facebook", "carousel", [
        img("image/jpeg", 11 * 1024 * 1024),
        img(),
      ]),
    ).toEqual(["mediaTooLarge"])
    expect(
      issuesOf("facebook", "carousel", [img("image/webp"), img()]),
    ).toEqual(["mediaFormatNotSupported"])
  })

  test("Facebook reel is 3 to 90 seconds; a story video up to 60; a story has no text", () => {
    expect(issuesOf("facebook", "reel", [vid(91_000)])).toEqual([
      "mediaTooLong",
    ])
    expect(issuesOf("facebook", "story", [vid(61_000)])).toEqual([
      "mediaTooLong",
    ])
    expect(issuesOf("facebook", "story", [img()], { text: "x" })).toEqual([
      "textTooLong",
    ])
  })

  test("Facebook video and reel take a title setting", () => {
    expect(
      issuesOf("facebook", "video", [vid()], { options: { title: "A" } }),
    ).toEqual([])
    expect(
      issuesOf("facebook", "video", [vid()], { options: { title: 3 } }),
    ).toEqual(["optionsInvalid"])
  })
})

describe("TikTok video rules", () => {
  const base = {
    contentType: "video" as const,
    linkUrl: null,
    media: [
      {
        durationMs: 30_000,
        kind: "video" as const,
        mimeType: "video/mp4",
        size: 1_000_000,
      },
    ],
    provider: "tiktok" as const,
    text: "caption",
  }
  const options = {
    allowComment: false,
    brandContent: false,
    brandOrganic: false,
    commercialContent: false,
    privacyLevel: "PUBLIC_TO_EVERYONE",
  }

  test("photos stay disabled", () => {
    const result = normalisePublishTarget({
      ...base,
      contentType: "image",
      options: {},
    })
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "contentTypeDisabled",
    ])
  })

  test("the privacy level has no default: omitting it names the setting", () => {
    const result = normalisePublishTarget({ ...base, options: {} })
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "optionsInvalid",
        message: expect.stringContaining("privacyLevel"),
      }),
    ])
  })

  test("interaction switches default off", () => {
    const result = normalisePublishTarget({ ...base, options })
    expect(result.issues).toEqual([])
    expect(result.options).toMatchObject({
      allowComment: false,
      allowDuet: false,
      allowStitch: false,
    })
  })

  test("a commercial disclosure needs a label, and branded content cannot be private", () => {
    expect(
      normalisePublishTarget({
        ...base,
        options: { ...options, commercialContent: true },
      }).issues,
    ).toHaveLength(1)
    expect(
      normalisePublishTarget({
        ...base,
        options: {
          ...options,
          brandContent: true,
          commercialContent: true,
          privacyLevel: "SELF_ONLY",
        },
      }).issues,
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("privacyLevel"),
      }),
    ])
  })

  test("caption, size and duration limits come from the docs", () => {
    expect(
      normalisePublishTarget({
        ...base,
        options,
        text: "x".repeat(2201),
      }).issues.map((i) => i.code),
    ).toEqual(["textTooLong"])
    expect(
      normalisePublishTarget({
        ...base,
        media: [
          {
            durationMs: 601_000,
            kind: "video",
            mimeType: "video/mp4",
            size: 1,
          },
        ],
        options,
      }).issues.map((i) => i.code),
    ).toEqual(["mediaTooLong"])
    expect(
      normalisePublishTarget({
        ...base,
        media: [
          {
            durationMs: 1000,
            kind: "video",
            mimeType: "video/mp4",
            size: 4 * 1024 ** 3 + 1,
          },
        ],
        options,
      }).issues.map((i) => i.code),
    ).toEqual(["mediaTooLarge"])
  })
})

describe("captionWithLink", () => {
  const link = "https://example.com/a"
  test("appends the link after a blank line", () => {
    expect(
      captionWithLink({ linkUrl: link, supportsLink: false, text: "hello" }),
    ).toBe(`hello\n\n${link}`)
  })
  test("does not repeat a URL the caption already has", () => {
    const text = `see ${link} now`
    expect(captionWithLink({ linkUrl: link, supportsLink: false, text })).toBe(
      text,
    )
  })
  test("uses the link alone when the caption is empty", () => {
    expect(
      captionWithLink({ linkUrl: link, supportsLink: false, text: "  " }),
    ).toBe(link)
  })
  test("leaves the text alone for a type with a link field", () => {
    expect(
      captionWithLink({ linkUrl: link, supportsLink: true, text: "hello" }),
    ).toBe("hello")
  })
  test("returns the text when there is no link", () => {
    expect(
      captionWithLink({ linkUrl: null, supportsLink: false, text: "hi" }),
    ).toBe("hi")
  })
})

describe("link in the caption", () => {
  const link = "https://example.com/a"
  test("a photo with a link raises no issue and carries the link in its text", () => {
    const result = normalisePublishTarget({
      contentType: "image",
      linkUrl: link,
      media: [image()],
      options: {},
      provider: "facebook",
      text: "hello",
    })
    expect(result.issues).toEqual([])
    expect(result.text).toBe(`hello\n\n${link}`)
    expect(result.linkUrl).toBeNull()
  })
  test("a Facebook link post keeps its structured link", () => {
    const result = normalisePublishTarget({
      contentType: "link",
      linkUrl: link,
      media: [],
      options: {},
      provider: "facebook",
      text: "hello",
    })
    expect(result.text).toBe("hello")
    expect(result.linkUrl).toBe(link)
  })
  test("the link counts against the Threads 500 limit", () => {
    const room = 500 - `\n\n${link}`.length
    const run = (length: number) =>
      codes({
        contentType: "text",
        linkUrl: link,
        provider: "threads",
        text: "a".repeat(length),
      })
    expect(run(room)).toEqual([])
    expect(run(room + 1)).toEqual(["textTooLong"])
  })
  test("a link alone satisfies a required text", () => {
    expect(
      codes({
        contentType: "text",
        linkUrl: link,
        provider: "threads",
        text: null,
      }),
    ).toEqual([])
  })
  test("a link without a protocol is still rejected", () => {
    expect(
      codes({
        contentType: "text",
        linkUrl: "example.com",
        provider: "threads",
        text: "hi",
      }),
    ).toEqual(["linkRequired"])
  })
  test("a story, which carries no text, still cannot take a link", () => {
    expect(
      codes({
        contentType: "story",
        linkUrl: link,
        media: [image()],
        provider: "instagram",
      }),
    ).toContain("linkNotSupported")
  })
})
