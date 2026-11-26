import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))

const { composeFeedText } = await import("../src/social-post-feed/compose")
const { registerFeedAiModelChecker, registerFeedPostWriter } = await import(
  "../src/social-post-feed/writer"
)
const { assertProviderTemplates } = await import(
  "../src/social-post-feed/template-check"
)
const { renderProviderTexts } = await import(
  "../src/social-post-feed/provider-texts"
)

const writer = vi.fn()
const feed = {
  aiInstructions: null,
  aiIntegrationId: null,
  aiModel: null,
  aiWrite: false,
  id: "feed-1",
  templateSyntax: "v2" as const,
  templatesByProvider: {
    instagram: "{{ title }}\n{{ categories | hashtags: 3 }}",
    threads: "{{ title }}\n{{ link }}",
  },
  textTemplate: "{{ title }}\n{{ link }}",
  workspaceId: "ws-1",
}
const item = {
  author: null,
  categories: ["Tin tức", "Sale"],
  content: null,
  feedLink: null,
  feedTitle: null,
  fields: {},
  image: null,
  itemKey: "k1",
  link: "https://example.com/a",
  publishedAt: null,
  summary: null,
  title: "Hello",
}
const run = (
  overrides: Partial<typeof feed> = {},
  extra: {
    providers?: ("facebook" | "instagram" | "threads" | "tiktok")[]
    signature?: string | null
  } = {},
) =>
  composeFeedText({
    destinationIds: ["d1"],
    feed: { ...feed, ...overrides },
    item,
    providers: extra.providers ?? ["facebook", "instagram", "threads"],
    purpose: "post",
    signature: extra.signature ?? null,
    timeZone: "UTC",
  })

beforeEach(() => {
  vi.clearAllMocks()
  registerFeedPostWriter(writer)
  registerFeedAiModelChecker(vi.fn().mockResolvedValue(true))
})

describe("per-network templates in composeFeedText", () => {
  test("a network's own text is returned only when it differs from the shared text", async () => {
    const result = await run()

    expect(result.text).toBe("Hello\nhttps://example.com/a")
    expect(result.providerTexts).toEqual({
      instagram: "Hello\n#TinTức #Sale",
    })
  })

  test("a network that is not a destination is not rendered", async () => {
    const result = await run({}, { providers: ["facebook"] })

    expect(result.providerTexts).toEqual({})
  })

  test("the signature is appended to a network's own text too", async () => {
    const result = await run({}, { signature: "-- sig" })

    expect(result.providerTexts.instagram).toContain("#TinTức #Sale")
    expect(result.providerTexts.instagram).toContain("-- sig")
    expect(result.text).toContain("-- sig")
  })

  test("a legacy feed ignores network templates", async () => {
    const result = await run({
      templateSyntax: "legacy",
      textTemplate: "{title}\n{link}",
    } as never)

    expect(result.providerTexts).toEqual({})
  })

  test("AI writing stays one shared text for every network", async () => {
    writer.mockResolvedValue("Fresh news!")

    const result = await run({ aiWrite: true })

    expect(result.providerTexts).toEqual({})
    expect(result.text).toContain("Fresh news!")
    expect(writer).toHaveBeenCalledTimes(1)
  })

  test("an AI failure falls back to the template and the network texts apply", async () => {
    writer.mockRejectedValue(new Error("down"))

    const result = await run({ aiWrite: true })

    expect(result.note).toBe("aiFallback")
    expect(result.providerTexts.instagram).toBe("Hello\n#TinTức #Sale")
  })

  test("a network template that renders to nothing is reported as empty text", async () => {
    const result = await run({
      templatesByProvider: {
        instagram: "{{#if author}}{{ author }}{{/if}}",
      },
    })

    expect(result.providerTexts).toEqual({ instagram: "" })
  })
})

describe("assertProviderTemplates", () => {
  test("accepts nothing, or valid v2 templates", () => {
    expect(() => assertProviderTemplates("v2", {})).not.toThrow()
    expect(() => assertProviderTemplates("legacy", {})).not.toThrow()
    expect(() =>
      assertProviderTemplates("v2", { facebook: "{{ title }}" }),
    ).not.toThrow()
  })

  test("refuses an unknown network key", () => {
    expect(() =>
      assertProviderTemplates("v2", { myspace: "{{ title }}" } as never),
    ).toThrow("network")
  })

  test("refuses network texts on a legacy feed", () => {
    expect(() =>
      assertProviderTemplates("legacy", { facebook: "{{ title }}" }),
    ).toThrow("templateSyntax v2")
  })

  test("refuses old tokens and reports the field and place of a bad template", () => {
    expect(() => assertProviderTemplates("v2", { threads: "{title}" })).toThrow(
      "old",
    )
    try {
      assertProviderTemplates("v2", { tiktok: "line\n{{ title | nope }}" })
      expect.unreachable()
    } catch (error) {
      expect(
        (error as { data: { field: string; line: number } }).data,
      ).toMatchObject({ field: "templatesByProvider.tiktok", line: 2 })
    }
  })

  test("refuses an empty or over-long text", () => {
    expect(() => assertProviderTemplates("v2", { facebook: "" })).toThrow()
    expect(() =>
      assertProviderTemplates("v2", { facebook: "x".repeat(5001) }),
    ).toThrow()
  })
})

describe("renderProviderTexts", () => {
  test("lists only networks with a template, in provider order, with problems", () => {
    const texts = renderProviderTexts({
      image: null,
      item,
      templates: {
        threads: "{{ title | nope }}",
        facebook: "FB {{ title }}",
      },
      timeZone: "UTC",
    })

    expect(texts.map((entry) => entry.provider)).toEqual([
      "facebook",
      "threads",
    ])
    expect(texts[0]).toMatchObject({ templateProblem: null, text: "FB Hello" })
    expect(texts[1]?.templateProblem?.code).toBe("unknownFilter")
    expect(texts[1]?.text).toBe("")
  })
})
