// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockFindForInbox = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostRepository: { findForInbox: mockFindForInbox },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: vi
    .fn()
    .mockResolvedValue({ storageUrl: "https://cdn.test/bucket" }),
}))

vi.mock("../src/base.service", () => ({ BaseService: class {} }))

const { buildTextLinkShareText, channelPostShareService } = await import(
  "../src/channel-post/share.service"
)
const { countMessageCharacters } = await import("@chatbotx.io/flow-config")

const LINK = "https://www.instagram.com/p/Cabc123/"
const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}"
const DANGLING_JOINER = /\u200d\u2026$/
const LONE_HIGH_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])/
const LONE_LOW_SURROGATE = /(?<![\ud800-\udbff])[\udc00-\udfff]/
const LETTER_A = /a/g
const WHOLE_FAMILIES = new RegExp(`^(?:${FAMILY})*$`, "u")

const post = (overrides: Record<string, unknown> = {}) => ({
  id: "post-1",
  caption: "Summer sale\nAll week long",
  channel: "messenger",
  contentType: "photo",
  externalPostId: "ext-1",
  inboxId: "inbox-1",
  inboxMatches: true,
  permalink: LINK,
  thumbnail: "https://cdn.example.com/1.jpg",
  ...overrides,
})

const input = (channel: string) => ({
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  channel,
  channelPostId: "post-1",
})

describe("buildTextLinkShareText", () => {
  const build = (caption: string | null, limit = 2000, permalink = LINK) =>
    buildTextLinkShareText({ caption, permalink, limit })

  test("is the caption's first line, a line break and the link", () => {
    expect(build("  Summer sale  \nAll week long")).toBe(`Summer sale\n${LINK}`)
  })

  test("skips blank leading lines of the caption", () => {
    expect(build("\n \r\n Hello\nworld")).toBe(`Hello\n${LINK}`)
  })

  test("is the link alone when there is no caption", () => {
    for (const caption of [null, "", "  \n  "]) {
      expect(build(caption)).toBe(LINK)
    }
  })

  test("shortens a long name to the limit, keeps the link whole and ends the name with an ellipsis", () => {
    const limit = 100
    const text = build("a".repeat(500), limit)

    expect(countMessageCharacters(text)).toBe(limit)
    expect(text.endsWith(`…\n${LINK}`)).toBe(true)
  })

  test("never splits an emoji or a surrogate pair at the cut", () => {
    const limit = 50
    const caption = `${"a".repeat(limit - LINK.length - 3)}${FAMILY}${FAMILY} more words`
    const text = build(caption, limit)
    const name = text.slice(0, text.indexOf("\n"))

    expect(countMessageCharacters(text)).toBeLessThanOrEqual(limit)
    expect(name.endsWith("\u2026")).toBe(true)
    // Whole family emoji only: a half one would leave a lone joiner or surrogate.
    expect(name).not.toMatch(DANGLING_JOINER)
    expect(name).not.toMatch(LONE_HIGH_SURROGATE)
    expect(name).not.toMatch(LONE_LOW_SURROGATE)
    expect(name.replace(LETTER_A, "").replace("\u2026", "")).toMatch(
      WHOLE_FAMILIES,
    )
  })

  test("counts an emoji once, like the channel limit does", () => {
    const text = build("🎉".repeat(10), 2000)
    expect(text).toBe(`${"🎉".repeat(10)}\n${LINK}`)
  })

  test("falls back to the link alone when no room is left for a name", () => {
    expect(build("Sale", LINK.length + 1)).toBe(LINK)
    expect(build("Sale", LINK.length + 2)).toBe(LINK)
    expect(build("Sale", LINK.length + 3)).toBe(`S…\n${LINK}`)
  })
})

describe("channelPostShareService.resolveForSend", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindForInbox.mockResolvedValue(post())
  })

  test("asks the repository for the workspace's post on the inbox", async () => {
    await channelPostShareService.resolveForSend(input("messenger"))

    expect(mockFindForInbox).toHaveBeenCalledWith({
      channelPostId: "post-1",
      inboxId: "inbox-1",
      workspaceId: "ws-1",
    })
  })

  test("a text-link channel gets the built text", async () => {
    const resolved = await channelPostShareService.resolveForSend(
      input("messenger"),
    )

    expect(resolved.content).toEqual({
      mode: "textLink",
      text: `Summer sale\n${LINK}`,
    })
  })

  test("a native channel gets the post's platform id", async () => {
    mockFindForInbox.mockResolvedValue(post({ channel: "instagram" }))

    const resolved = await channelPostShareService.resolveForSend(
      input("instagram"),
    )

    expect(resolved.content).toEqual({
      mode: "nativeMedia",
      externalPostId: "ext-1",
    })
  })

  test("a native channel needs no link", async () => {
    mockFindForInbox.mockResolvedValue(post({ permalink: null }))

    await expect(
      channelPostShareService.resolveForSend(input("instagram")),
    ).resolves.toMatchObject({ content: { mode: "nativeMedia" } })
  })

  const refusal = (reason: string) => ({
    code: "channelPostShareRefused",
    httpStatusCode: 422,
    reason,
  })

  test("channelPostNotFound when the post is missing or removed", async () => {
    mockFindForInbox.mockResolvedValue(null)

    await expect(
      channelPostShareService.resolveForSend(input("messenger")),
    ).rejects.toMatchObject(refusal("channelPostNotFound"))
  })

  test("channelPostInboxMismatch when the post belongs to another inbox", async () => {
    mockFindForInbox.mockResolvedValue(post({ inboxMatches: false }))

    await expect(
      channelPostShareService.resolveForSend(input("messenger")),
    ).rejects.toMatchObject(refusal("channelPostInboxMismatch"))
  })

  test("channelPostTypeNotShareable for a kind the channel does not take", async () => {
    mockFindForInbox.mockResolvedValue(post({ contentType: "story" }))

    await expect(
      channelPostShareService.resolveForSend(input("messenger")),
    ).rejects.toMatchObject(refusal("channelPostTypeNotShareable"))
  })

  test("channelPostShareUnsupported on a channel that cannot send posts", async () => {
    await expect(
      channelPostShareService.resolveForSend(input("whatsapp")),
    ).rejects.toMatchObject(refusal("channelPostShareUnsupported"))
    expect(mockFindForInbox).not.toHaveBeenCalled()
  })

  test("channelPostLinkUnavailable for a text-link channel and a post with no link", async () => {
    mockFindForInbox.mockResolvedValue(post({ permalink: null }))

    await expect(
      channelPostShareService.resolveForSend(input("messenger")),
    ).rejects.toMatchObject(refusal("channelPostLinkUnavailable"))
  })

  test("channelPostLinkTooLong for a link longer than the channel's text limit", async () => {
    mockFindForInbox.mockResolvedValue(
      post({ permalink: `https://x.test/${"a".repeat(2000)}` }),
    )

    await expect(
      channelPostShareService.resolveForSend(input("messenger")),
    ).rejects.toMatchObject(refusal("channelPostLinkTooLong"))
  })
})

describe("channelPostShareService.prepareOutgoing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("a text-link share stores the text and a card snapshot", async () => {
    mockFindForInbox.mockResolvedValue(post())

    const prepared = await channelPostShareService.prepareOutgoing(
      input("messenger"),
    )

    expect(prepared.text).toBe(`Summer sale\n${LINK}`)
    expect(prepared.contentAttributes).toEqual({
      type: "channel_post",
      shareMode: "textLink",
      channelPostId: "post-1",
      externalPostId: "ext-1",
      permalink: LINK,
      thumbnail: "https://cdn.example.com/1.jpg",
      caption: "Summer sale\nAll week long",
    })
  })

  test("resolves a storage-path thumbnail to a public URL", async () => {
    mockFindForInbox.mockResolvedValue(
      post({ thumbnail: "public/space/ws-1/thumb.jpg" }),
    )

    const prepared = await channelPostShareService.prepareOutgoing(
      input("messenger"),
    )

    expect(prepared.contentAttributes.thumbnail).toBe(
      "https://cdn.test/bucket/public/space/ws-1/thumb.jpg",
    )
  })

  test("a native share stores no text", async () => {
    mockFindForInbox.mockResolvedValue(post({ channel: "instagram" }))

    const prepared = await channelPostShareService.prepareOutgoing(
      input("instagram"),
    )

    expect(prepared.text).toBeNull()
    expect(prepared.contentAttributes.shareMode).toBe("nativeMedia")
  })

  test("the composer, the API and the worker build the same text for the same post", async () => {
    mockFindForInbox.mockResolvedValue(post({ caption: "x".repeat(5000) }))

    const [composer, worker] = await Promise.all([
      channelPostShareService.prepareOutgoing(input("messenger")),
      channelPostShareService.resolveForSend(input("messenger")),
    ])

    expect(worker.content).toEqual({ mode: "textLink", text: composer.text })
  })
})

describe("channelPostShareService.shareCriteria", () => {
  test("lists one criterion per channel that can send posts, with its link need", () => {
    expect(channelPostShareService.shareCriteria()).toEqual([
      {
        channel: "instagram",
        contentTypes: ["photo", "video", "reel", "carousel"],
        requirePermalink: false,
      },
      {
        channel: "messenger",
        contentTypes: ["text", "photo", "video", "reel", "carousel", "link"],
        requirePermalink: true,
      },
    ])
  })
})
