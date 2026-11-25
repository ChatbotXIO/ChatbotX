import { describe, expect, test } from "vitest"
import { postsSearchParsers } from "@/features/channel-posts/lib/posts-search-params"
import {
  bucketOfShow,
  composedNarrowingOf,
  POSTS_SHOW_OPTIONS,
} from "@/features/channel-posts/lib/posts-show"
import type { CalendarItem } from "@/features/social-posts/lib/calendar-items"
import {
  POSTS_LIST_FILTERS,
  type PostsListFilter,
} from "@/features/social-posts/lib/calendar-view-state"
import {
  groupListItems,
  listQueryFor,
  postsListUrl,
  showsUndatedDrafts,
  viewFilterAfterSave,
} from "@/features/social-posts/lib/list-filter"

const PERIOD = {
  from: new Date("2026-09-01T00:00:00Z"),
  to: new Date("2026-09-30T23:59:59Z"),
}
const HCM = "Asia/Ho_Chi_Minh"

const item = (postId: string, at: Date | null): CalendarItem => ({
  at,
  canUnschedule: false,
  destinationName: "Page A",
  isMovable: false,
  permalink: null,
  postId,
  provider: "facebook",
  status: at ? "pending" : "draft",
  targetId: null,
  text: postId,
})
const dated = (postId: string, iso: string) =>
  item(postId, new Date(iso)) as CalendarItem & { at: Date }

describe("listQueryFor", () => {
  test("all, scheduled and published follow the visible range", () => {
    expect(listQueryFor("all", PERIOD)).toEqual({
      bucket: undefined,
      window: PERIOD,
    })
    expect(listQueryFor("scheduled", PERIOD)).toEqual({
      bucket: "scheduled",
      window: PERIOD,
    })
    expect(listQueryFor("published", PERIOD)).toEqual({
      bucket: "published",
      window: PERIOD,
    })
  })

  test("drafts and needs attention ignore the visible range", () => {
    expect(listQueryFor("drafts", PERIOD)).toEqual({
      bucket: "drafts",
      window: undefined,
    })
    expect(listQueryFor("needsAttention", PERIOD)).toEqual({
      bucket: "needsAttention",
      window: undefined,
    })
  })

  test("the grids keep the visible range for every filter, narrowed to the bucket", () => {
    expect(listQueryFor("all", PERIOD, false)).toEqual({
      bucket: undefined,
      window: PERIOD,
    })
    expect(listQueryFor("drafts", PERIOD, false)).toEqual({
      bucket: "drafts",
      window: PERIOD,
    })
    expect(listQueryFor("needsAttention", PERIOD, false)).toEqual({
      bucket: "needsAttention",
      window: PERIOD,
    })
    expect(listQueryFor("published", PERIOD, false)).toEqual({
      bucket: "published",
      window: PERIOD,
    })
  })

  test("every filter maps to a query", () => {
    for (const filter of POSTS_LIST_FILTERS) {
      expect(() => listQueryFor(filter, PERIOD)).not.toThrow()
    }
  })

  test("only all and drafts show undated drafts", () => {
    const shown = POSTS_LIST_FILTERS.filter((f: PostsListFilter) =>
      showsUndatedDrafts(f),
    )
    expect(shown).toEqual(["all", "drafts"])
  })
})

describe("groupListItems", () => {
  const rows = [
    dated("b", "2026-09-11T10:00:00Z"),
    dated("a", "2026-09-10T10:00:00Z"),
    dated("c", "2026-09-10T02:00:00Z"),
  ]

  test("puts No date first, then days oldest first inside a range", () => {
    const groups = groupListItems({
      dated: rows,
      newestFirst: false,
      timezone: HCM,
      undated: [item("n1", null)],
    })

    expect(groups.noDate.map((i) => i.postId)).toEqual(["n1"])
    expect(groups.days.map((g) => g.key)).toEqual(["2026-09-10", "2026-09-11"])
    expect(groups.days[0].items.map((i) => i.postId)).toEqual(["c", "a"])
  })

  test("runs newest day first for a list of every post of a bucket", () => {
    const groups = groupListItems({
      dated: rows,
      newestFirst: true,
      timezone: HCM,
      undated: [],
    })

    expect(groups.days.map((g) => g.key)).toEqual(["2026-09-11", "2026-09-10"])
    expect(groups.days[1].items.map((i) => i.postId)).toEqual(["a", "c"])
  })

  test("groups by the calendar day in the calendar timezone", () => {
    // 20:00 UTC is already the next day in Ho Chi Minh (UTC+7).
    const groups = groupListItems({
      dated: [dated("late", "2026-09-10T20:00:00Z")],
      newestFirst: false,
      timezone: HCM,
      undated: [],
    })

    expect(groups.days.map((g) => g.key)).toEqual(["2026-09-11"])
  })
})

describe("the toast's View action", () => {
  test("opens the calendar's list on the matching state", () => {
    expect(postsListUrl("ws1", "drafts")).toBe(
      "/space/ws1/posts/calendar?view=list&status=drafts",
    )
    expect(postsListUrl("ws1", "scheduled")).toBe(
      "/space/ws1/posts/calendar?view=list&status=scheduled",
    )
  })

  test("a draft save views drafts, a schedule views scheduled, publish now has none", () => {
    expect(viewFilterAfterSave("draft")).toBe("drafts")
    expect(viewFilterAfterSave("scheduled")).toBe("scheduled")
    expect(viewFilterAfterSave("now")).toBeUndefined()
  })
})

describe("the Posts tab's show param", () => {
  test("channels is the table, every other choice lists one bucket", () => {
    expect(bucketOfShow("channels")).toBeUndefined()
    expect(bucketOfShow("drafts")).toBe("drafts")
    expect(bucketOfShow("scheduled")).toBe("scheduled")
    expect(bucketOfShow("needsAttention")).toBe("needsAttention")
    expect(bucketOfShow("published")).toBe("published")
  })

  test("the bar runs On channels, Drafts, Scheduled, Needs attention, Published", () => {
    expect([...POSTS_SHOW_OPTIONS]).toEqual([
      "channels",
      "drafts",
      "scheduled",
      "needsAttention",
      "published",
    ])
  })

  test("the URL param defaults to channels and accepts only the enum", () => {
    const parser = postsSearchParsers.show
    expect(parser.defaultValue).toBe("channels")
    expect(parser.parse("drafts")).toBe("drafts")
    expect(parser.parse("nonsense")).toBeNull()
  })
})

describe("composedNarrowingOf", () => {
  const base = {
    channels: [],
    from: null,
    inboxIds: [],
    search: null,
    to: null,
  } as const

  test("no filter narrows nothing", () => {
    expect(composedNarrowingOf(base)).toEqual({
      from: undefined,
      inboxIds: undefined,
      providers: undefined,
      search: undefined,
      to: undefined,
    })
  })

  test("channels become networks and pages become inboxes", () => {
    const narrowing = composedNarrowingOf({
      ...base,
      channels: ["messenger", "threads"],
      inboxIds: ["7"],
      search: "sale",
    })

    expect(narrowing.providers).toEqual(["facebook", "threads"])
    expect(narrowing.inboxIds).toEqual(["7"])
    expect(narrowing.search).toBe("sale")
  })

  test("the date range covers whole days", () => {
    const narrowing = composedNarrowingOf({
      ...base,
      from: "2026-09-01",
      to: "2026-09-02",
    })

    expect(narrowing.from?.getHours()).toBe(0)
    expect(narrowing.to?.getHours()).toBe(23)
  })
})
