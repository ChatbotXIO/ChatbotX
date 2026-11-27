import { describe, expect, test } from "vitest"
import {
  exportListInput,
  hasExportRange,
  isTruncatedExport,
  listInputFromFilters,
  MAX_EXPORT_POSTS,
  type PostsFilters,
  postsExportUrl,
  selectExportPosts,
} from "@/features/channel-posts/lib/posts-list-input"

const filters = (overrides: Partial<PostsFilters> = {}): PostsFilters => ({
  allPosts: false,
  authorIds: [],
  channels: [],
  from: null,
  hideComments: null,
  hidePhoneComments: null,
  inboxIds: [],
  postType: null,
  search: null,
  show: "channels",
  skipComments: null,
  sort: "newest",
  to: null,
  topicIds: [],
  ...overrides,
})

const posts = (count: number): { id: string }[] =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index}` }))

describe("header export of the Posts page", () => {
  test("needs both ends of the date range", () => {
    expect(hasExportRange(filters())).toBe(false)
    expect(hasExportRange(filters({ from: "2026-01-01" }))).toBe(false)
    expect(hasExportRange(filters({ to: "2026-01-31" }))).toBe(false)
    expect(
      hasExportRange(filters({ from: "2026-01-01", to: "2026-01-31" })),
    ).toBe(true)
  })

  test("lists with the page's own filters, one post more than the limit", () => {
    const input = exportListInput(
      filters({
        allPosts: true,
        channels: ["messenger"],
        from: "2026-01-01",
        postType: "video",
        search: "sale",
        to: "2026-01-31",
      }),
    )
    expect(input).toMatchObject({
      channels: ["messenger"],
      contentTypes: ["video", "reel"],
      hasComments: "false",
      limit: MAX_EXPORT_POSTS + 1,
      search: "sale",
    })
    expect(input.publishedFrom).toEqual(new Date("2026-01-01T00:00:00"))
    expect(input.publishedTo).toEqual(new Date("2026-01-31T23:59:59.999"))
    expect(listInputFromFilters(filters(), undefined)).toMatchObject({
      authorIds: undefined,
      sort: "newest",
    })
  })

  test("takes every matching post up to the limit", () => {
    expect(selectExportPosts(posts(3))).toEqual({
      limited: false,
      postIds: ["p0", "p1", "p2"],
    })
    expect(selectExportPosts(posts(MAX_EXPORT_POSTS)).limited).toBe(false)
  })

  test("cuts at the limit and says posts were left out", () => {
    const selection = selectExportPosts(posts(MAX_EXPORT_POSTS + 1))
    expect(selection.limited).toBe(true)
    expect(selection.postIds).toHaveLength(MAX_EXPORT_POSTS)
  })

  test("nothing matching selects nothing", () => {
    expect(selectExportPosts([])).toEqual({ limited: false, postIds: [] })
  })

  test("builds the per-post export route with every post id", () => {
    expect(postsExportUrl("w1", "comments", ["a", "b"])).toBe(
      "/space/w1/posts/export?kind=comments&postId=a&postId=b",
    )
  })
})

describe("isTruncatedExport", () => {
  test("reads the X-Export-Truncated header of the export route", () => {
    expect(
      isTruncatedExport(new Headers({ "X-Export-Truncated": "true" })),
    ).toBe(true)
    expect(
      isTruncatedExport(new Headers({ "X-Export-Truncated": "false" })),
    ).toBe(false)
    expect(isTruncatedExport(new Headers())).toBe(false)
  })
})
