import { describe, expect, test } from "vitest"
import {
  buildAuthorOptions,
  buildInboxOptions,
  type PostFilterAuthor,
  type PostFilterInbox,
} from "@/features/channel-posts/lib/post-filter-options"
import { POST_TYPE_OPTIONS } from "@/features/channel-posts/lib/posts-search-params"

const inboxes: PostFilterInbox[] = [
  { channel: "messenger", id: "1", name: "Bán Hàng Tự Động" },
  { channel: "instagram", id: "2", name: "Test2" },
]

const authors: PostFilterAuthor[] = [
  {
    authorExternalId: "u1",
    authorKey: "1:u1",
    authorName: "Titan",
    channel: "messenger",
    inboxName: "Bán Hàng Tự Động",
  },
  {
    authorExternalId: "u1",
    authorKey: "2:u1",
    authorName: "Titan",
    channel: "instagram",
    inboxName: "Test2",
  },
  {
    authorExternalId: "u9",
    authorKey: "2:u9",
    authorName: null,
    channel: "instagram",
    inboxName: "Test2",
  },
]

describe("post type options", () => {
  test("past live and live now are always listed", () => {
    expect(POST_TYPE_OPTIONS).toContain("pastLive")
    expect(POST_TYPE_OPTIONS).toContain("liveNow")
  })
})

describe("buildInboxOptions", () => {
  test("every option carries a channel icon and searchable channel name", () => {
    const options = buildInboxOptions(inboxes, [])
    expect(options).toHaveLength(2)
    for (const option of options) {
      expect(option.icon).toBeTypeOf("function")
      expect(option.keywords?.length).toBe(1)
    }
    expect(options[0]?.channel).toBe("messenger")
  })

  test("narrows to the selected channels", () => {
    expect(
      buildInboxOptions(inboxes, ["instagram"]).map((o) => o.value),
    ).toEqual(["2"])
  })
})

describe("buildAuthorOptions", () => {
  test("the label names the page and the channel icon is present", () => {
    const [first] = buildAuthorOptions(authors)
    expect(first?.label).toBe("Titan · Bán Hàng Tự Động")
    expect(first?.icon).toBeTypeOf("function")
    expect(first?.keywords).toContain("Bán Hàng Tự Động")
  })

  test("two authors with the same name on different pages are distinct options", () => {
    const options = buildAuthorOptions(authors)
    const titans = options.filter((o) => o.label.startsWith("Titan"))
    expect(titans).toHaveLength(2)
    expect(new Set(options.map((o) => o.value)).size).toBe(options.length)
    expect(titans.map((o) => o.value)).toEqual(["1:u1", "2:u1"])
  })

  test("falls back to the external id when the name is unknown", () => {
    expect(buildAuthorOptions(authors)[2]?.label).toBe("u9 · Test2")
  })
})
