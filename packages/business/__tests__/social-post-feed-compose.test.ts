import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))

const { composeFeedText, FEED_AI_FALLBACK_NOTE } = await import(
  "../src/social-post-feed/compose"
)
const { registerFeedAiModelChecker, registerFeedPostWriter } = await import(
  "../src/social-post-feed/writer"
)

const writer = vi.fn()
const checker = vi.fn()

const feed = {
  aiInstructions: "friendly",
  aiIntegrationId: "openai",
  aiModel: "gpt",
  aiWrite: true,
  id: "feed-1",
  templateSyntax: "legacy" as const,
  textTemplate: "{title}\n{link}",
  workspaceId: "ws-1",
}
const item = {
  author: null,
  categories: ["Tin tức"],
  content: null,
  feedLink: null,
  feedTitle: null,
  fields: {},
  image: null,
  itemKey: "k1",
  link: "https://example.com/a",
  publishedAt: null,
  summary: "S",
  title: "Hello",
}
const run = (overrides: Partial<typeof feed> = {}) =>
  composeFeedText({
    destinationIds: ["d1"],
    feed: { ...feed, ...overrides },
    item,
    purpose: "post",
    signature: null,
    timeZone: "UTC",
  })

beforeEach(() => {
  vi.clearAllMocks()
  checker.mockResolvedValue(true)
  registerFeedPostWriter(writer)
  registerFeedAiModelChecker(checker)
})

describe("composeFeedText", () => {
  test("uses the template when AI is off, without calling the writer", async () => {
    expect(await run({ aiWrite: false })).toEqual({
      note: null,
      providerTexts: {},
      text: "Hello\nhttps://example.com/a",
    })
    expect(writer).not.toHaveBeenCalled()
  })

  test("uses the AI text, adds the link when it is missing, and appends the signature", async () => {
    writer.mockResolvedValue("Fresh news!")

    const result = await composeFeedText({
      destinationIds: ["d1"],
      feed,
      item,
      purpose: "post",
      signature: null,
      timeZone: "UTC",
    })

    expect(result).toEqual({
      note: null,
      providerTexts: {},
      text: "Fresh news!\nhttps://example.com/a",
    })
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "feed-1",
        brief: "Hello\nhttps://example.com/a",
        instructions: "friendly",
        integrationId: "openai",
        item: { link: item.link, summary: "S", title: "Hello" },
        model: "gpt",
        workspaceId: "ws-1",
      }),
    )
  })

  test("falls back to the template and notes it when the writer fails", async () => {
    writer.mockRejectedValue(new Error("provider down"))

    expect(await run()).toEqual({
      note: FEED_AI_FALLBACK_NOTE,
      providerTexts: {},
      text: "Hello\nhttps://example.com/a",
    })
  })

  test("a foreign or stale integration id is never used: template fallback, writer not called", async () => {
    checker.mockResolvedValue(false)

    expect(await run()).toMatchObject({ note: FEED_AI_FALLBACK_NOTE })
    expect(checker).toHaveBeenCalledWith({
      integrationId: "openai",
      model: "gpt",
      workspaceId: "ws-1",
    })
    expect(writer).not.toHaveBeenCalled()
  })
})

describe("composeFeedText with the template language", () => {
  const v2 = {
    ...feed,
    aiWrite: false,
    templateSyntax: "v2" as const,
    textTemplate:
      "{{ title }}\n{{ categories | hashtags: 2 }}\n{{#if image}}photo{{else}}no photo{{/if}}",
  }

  test("renders fields, filters and conditions, not cut to a length", async () => {
    expect(
      await composeFeedText({
        destinationIds: ["d1"],
        feed: v2,
        item,
        purpose: "post",
        signature: "-- sig",
        timeZone: "UTC",
      }),
    ).toEqual({
      note: null,
      providerTexts: {},
      text: expect.stringContaining("Hello\n#TinTức\nno photo"),
    })
  })

  test("the chosen picture feeds {{ image }}", async () => {
    const result = await composeFeedText({
      destinationIds: ["d1"],
      feed: v2,
      image: "https://img.test/a.jpg",
      item,
      purpose: "post",
      signature: null,
      timeZone: "UTC",
    })

    expect(result.text).toContain("photo")
    expect(result.text).not.toContain("no photo")
  })

  test("a template problem propagates so the item is recorded", async () => {
    await expect(
      composeFeedText({
        destinationIds: ["d1"],
        feed: { ...v2, textTemplate: "{{ title | nope }}" },
        item,
        purpose: "post",
        signature: null,
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "unknownFilter" })
  })
})
