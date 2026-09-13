import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCountExistingTaggedIdentities = vi.fn()
const mockRunAction = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn().mockResolvedValue({}),
  contactInboxService: {
    countExistingTaggedIdentities: mockCountExistingTaggedIdentities,
  },
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {
    messenger: { runAction: mockRunAction },
  },
}))

const { createTagInfoResolver, extractInstagramMentions } = await import(
  "../src/integration/handlers/comment-automation/comment-tags"
)

const INTEGRATION_ROW = {
  id: "integration-1",
  auth: {},
  inboxId: "inbox-1",
} as never
const AUTH = {} as never

function buildResolver(
  overrides: {
    channelType?: string
    message?: string
    tags?: { id: string; name?: string }[]
  } = {},
) {
  return createTagInfoResolver({
    channelType: (overrides.channelType ?? "messenger") as never,
    workspaceId: "workspace-1",
    inboxId: "inbox-1",
    commentId: "comment-1",
    message: overrides.message,
    tags: overrides.tags,
    integrationRow: INTEGRATION_ROW,
    auth: AUTH,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCountExistingTaggedIdentities.mockResolvedValue(0)
  mockRunAction.mockResolvedValue([])
})

describe("extractInstagramMentions", () => {
  test("returns nothing for text without a mention", () => {
    expect(extractInstagramMentions("pc1")).toEqual([])
    expect(extractInstagramMentions(undefined)).toEqual([])
    expect(extractInstagramMentions("")).toEqual([])
  })

  test("reads a handle at the start, middle and end of the text", () => {
    expect(extractInstagramMentions("@alice hello")).toEqual(["alice"])
    expect(extractInstagramMentions("hey @alice look")).toEqual(["alice"])
    expect(extractInstagramMentions("pc3 @taunguyen171995")).toEqual([
      "taunguyen171995",
    ])
  })

  test("collects several handles and dedupes repeats", () => {
    expect(extractInstagramMentions("@a_one @b.two @a_one")).toEqual([
      "a_one",
      "b.two",
    ])
  })

  test("lowercases so matching against stored handles is exact", () => {
    expect(extractInstagramMentions("@TauNguyen")).toEqual(["taunguyen"])
  })

  // The whole point of the boundary in the regex: an email address is the
  // single most common way an `@` appears in a comment without being a tag.
  test("does not read an email address as a tag", () => {
    expect(extractInstagramMentions("mail me at user@example.com")).toEqual([])
  })

  test("ignores a doubled @ and a handle glued to a word", () => {
    expect(extractInstagramMentions("@@alice")).toEqual([])
    expect(extractInstagramMentions("word@alice")).toEqual([])
  })

  test("stops at a trailing dot, which Instagram handles cannot end with", () => {
    expect(extractInstagramMentions("thanks @alice.")).toEqual(["alice"])
  })

  test("caps at the 30-character handle limit", () => {
    const tooLong = "a".repeat(40)
    const [handle] = extractInstagramMentions(`@${tooLong}`)
    expect(handle).toHaveLength(30)
  })
})

describe("createTagInfoResolver on messenger", () => {
  test("counts the tags the webhook already carried, without a Graph call", async () => {
    mockCountExistingTaggedIdentities.mockResolvedValue(1)

    const info = await buildResolver({
      tags: [{ id: "user-a" }, { id: "user-b" }],
    })()

    expect(info).toEqual({ totalTagged: 2, totalNewTagged: 1 })
    expect(mockRunAction).not.toHaveBeenCalled()
    expect(mockCountExistingTaggedIdentities).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      sourceIds: ["user-a", "user-b"],
      sourceUsernames: [],
    })
  })

  test("dedupes the same person tagged twice in one comment", async () => {
    const info = await buildResolver({
      tags: [{ id: "user-a" }, { id: "user-a" }],
    })()

    expect(info.totalTagged).toBe(1)
  })

  test("falls back to the Graph API when the webhook carried no tags", async () => {
    mockRunAction.mockResolvedValue([{ id: "user-c" }])

    const info = await buildResolver({ tags: undefined })()

    expect(mockRunAction).toHaveBeenCalledWith(
      "getCommentMessageTags",
      expect.objectContaining({ input: { commentId: "comment-1" } }),
    )
    expect(info).toEqual({ totalTagged: 1, totalNewTagged: 1 })
  })

  test("reports zero — not a failure — when the fallback also finds nothing", async () => {
    const info = await buildResolver({ tags: [] })()

    expect(info).toEqual({ totalTagged: 0, totalNewTagged: 0 })
    expect(mockCountExistingTaggedIdentities).not.toHaveBeenCalled()
  })

  test("treats a failed Graph lookup as no tags rather than throwing", async () => {
    mockRunAction.mockRejectedValue(new Error("graph down"))

    await expect(buildResolver({ tags: undefined })()).resolves.toEqual({
      totalTagged: 0,
      totalNewTagged: 0,
    })
  })
})

describe("createTagInfoResolver on instagram", () => {
  test("resolves handles from the comment text and never calls Graph", async () => {
    mockCountExistingTaggedIdentities.mockResolvedValue(1)

    const info = await buildResolver({
      channelType: "instagram",
      message: "pc3 @alice @bob",
    })()

    expect(info).toEqual({ totalTagged: 2, totalNewTagged: 1 })
    expect(mockRunAction).not.toHaveBeenCalled()
    expect(mockCountExistingTaggedIdentities).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      sourceIds: [],
      sourceUsernames: ["alice", "bob"],
    })
  })

  test("ignores `message_tags` that could never arrive on this channel", async () => {
    const info = await buildResolver({
      channelType: "instagramFacebook",
      message: "no mentions here",
      tags: [{ id: "user-a" }],
    })()

    expect(info).toEqual({ totalTagged: 0, totalNewTagged: 0 })
  })
})

describe("createTagInfoResolver memoization", () => {
  // Several automations can match one comment; each would otherwise repeat the
  // Graph call and the contact lookup.
  test("resolves once however many times it is called", async () => {
    const resolve = buildResolver({ tags: [{ id: "user-a" }] })

    const [first, second] = [await resolve(), await resolve()]

    expect(first).toEqual(second)
    expect(mockCountExistingTaggedIdentities).toHaveBeenCalledTimes(1)
  })
})
