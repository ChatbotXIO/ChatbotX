import { describe, expect, test } from "vitest"
import {
  applyReschedule,
  buildDatedItems,
  buildUndatedItems,
  DEFAULT_DRAFT_TIME,
  isDayDroppable,
  itemsInRange,
  MIN_SCHEDULE_LEAD_MS,
  resolveDropInstant,
} from "@/features/social-posts/lib/calendar-items"
import type { ComposerPost } from "@/features/social-posts/lib/composer-state"

type Target = ComposerPost["targets"][number]

const makeTarget = (overrides: Partial<Target> & { id: string }): Target => ({
  contentType: "text",
  destination: {
    avatar: null,
    id: "d1",
    inboxId: null,
    isActive: true,
    name: "Page A",
    socialAccountId: "a1",
    username: null,
  },
  errorCategory: null,
  errorCode: null,
  errorMessage: null,
  externalPostId: null,
  media: [],
  options: {},
  overridesMedia: false,
  parts: [],
  permalink: null,
  provider: "facebook",
  publishedAt: null,
  queueSlotAt: null,
  removedAt: null,
  scheduleMode: "custom",
  scheduledAt: null,
  status: "pending",
  textOverride: null,
  timezone: null,
  ...overrides,
})

const makePost = (
  overrides: Partial<ComposerPost> & { id: string },
): ComposerPost => ({
  completedAt: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  createdById: null,
  createdVia: "ui",
  linkUrl: null,
  media: [],
  occurrenceAt: null,
  parentSocialPostId: null,
  recurrence: null,
  scheduledAt: null,
  status: "scheduled",
  targets: [],
  text: "Hello",
  topics: [],
  updatedAt: new Date("2026-09-01T00:00:00Z"),
  ...overrides,
})

const NOW = new Date("2026-09-10T05:00:00Z")
const HCM = "Asia/Ho_Chi_Minh"

describe("buildDatedItems", () => {
  const posts = [
    makePost({
      id: "p1",
      targets: [
        makeTarget({ id: "t1", scheduledAt: new Date("2026-09-12T02:00:00Z") }),
        makeTarget({
          id: "t2",
          publishedAt: new Date("2026-09-09T02:00:00Z"),
          scheduledAt: new Date("2026-09-09T01:00:00Z"),
          status: "published",
        }),
        makeTarget({ id: "t3", status: "cancelled" }),
        makeTarget({ id: "t4" }),
      ],
    }),
  ]

  test("makes one item per dated target and drops cancelled and undated ones", () => {
    expect(buildDatedItems(posts).map((i) => i.targetId)).toEqual(["t1", "t2"])
  })

  test("a published target sits at its published time and cannot move", () => {
    const published = buildDatedItems(posts)[1]
    expect(published.at?.toISOString()).toBe("2026-09-09T02:00:00.000Z")
    expect(published.isMovable).toBe(false)
  })

  test("a pending target can move and a scheduled post can go back to drafts", () => {
    const [pending] = buildDatedItems(posts)
    expect(pending.isMovable).toBe(true)
    expect(pending.canUnschedule).toBe(true)
  })

  test("a target's own text wins over the post text", () => {
    const [item] = buildDatedItems([
      makePost({
        id: "p2",
        targets: [
          makeTarget({
            id: "t9",
            scheduledAt: new Date("2026-09-12T02:00:00Z"),
            textOverride: "Override",
          }),
        ],
      }),
    ])
    expect(item.text).toBe("Override")
  })
})

describe("buildUndatedItems", () => {
  test("makes one movable item per draft post and ignores other posts", () => {
    const items = buildUndatedItems([
      makePost({
        id: "d1",
        status: "draft",
        targets: [
          makeTarget({ id: "x1" }),
          makeTarget({
            destination: {
              avatar: null,
              id: "d2",
              inboxId: null,
              isActive: true,
              name: "Shop",
              socialAccountId: "a2",
              username: null,
            },
            id: "x2",
          }),
        ],
      }),
      makePost({
        id: "s1",
        status: "scheduled",
        targets: [makeTarget({ id: "y" })],
      }),
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      destinationName: "Page A, Shop",
      at: null,
      isMovable: true,
      postId: "d1",
      status: "draft",
      targetId: null,
    })
  })
})

describe("itemsInRange", () => {
  test("keeps items inside the inclusive range", () => {
    const items = buildDatedItems([
      makePost({
        id: "p",
        targets: [
          makeTarget({
            id: "in",
            scheduledAt: new Date("2026-09-12T00:00:00Z"),
          }),
          makeTarget({
            id: "out",
            scheduledAt: new Date("2026-10-12T00:00:00Z"),
          }),
        ],
      }),
    ])
    const kept = itemsInRange(
      items,
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-30T23:59:59Z"),
    )
    expect(kept.map((i) => i.targetId)).toEqual(["in"])
  })
})

describe("isDayDroppable", () => {
  test("today and later are droppable, earlier days are not, in the display zone", () => {
    // 2026-09-10T05:00Z is 12:00 on the 10th in Ho Chi Minh.
    expect(isDayDroppable("2026-09-10", HCM, NOW)).toBe(true)
    expect(isDayDroppable("2026-09-11", HCM, NOW)).toBe(true)
    expect(isDayDroppable("2026-09-09", HCM, NOW)).toBe(false)
  })

  test("the same instant is still the 9th in Los Angeles", () => {
    expect(isDayDroppable("2026-09-09", "America/Los_Angeles", NOW)).toBe(true)
  })
})

describe("resolveDropInstant", () => {
  test("keeps the original wall-clock time on a future day in the display zone", () => {
    const at = resolveDropInstant({
      dayKeyValue: "2026-09-15",
      now: NOW,
      original: new Date("2026-09-12T02:30:00Z"),
      timezone: HCM,
    })
    // 02:30Z = 09:30 in Ho Chi Minh
    expect(at.toISOString()).toBe("2026-09-15T02:30:00.000Z")
  })

  test("an undated draft takes the default time of the day", () => {
    const at = resolveDropInstant({
      dayKeyValue: "2026-09-15",
      now: NOW,
      original: null,
      timezone: HCM,
    })
    expect(DEFAULT_DRAFT_TIME).toBe("09:00:00.000")
    expect(at.toISOString()).toBe("2026-09-15T02:00:00.000Z")
  })

  test("a time that already passed today moves to now plus the minimum lead", () => {
    const at = resolveDropInstant({
      dayKeyValue: "2026-09-10",
      now: NOW,
      original: new Date("2026-09-01T01:00:00Z"),
      timezone: HCM,
    })
    expect(at.getTime()).toBe(NOW.getTime() + MIN_SCHEDULE_LEAD_MS)
  })
})

describe("applyReschedule", () => {
  const posts = [
    makePost({
      id: "p1",
      targets: [
        makeTarget({ id: "t1", scheduledAt: new Date("2026-09-12T02:00:00Z") }),
        makeTarget({ id: "t2", scheduledAt: new Date("2026-09-12T03:00:00Z") }),
      ],
    }),
    makePost({ id: "p2", targets: [makeTarget({ id: "t3" })] }),
  ]
  const at = new Date("2026-09-20T01:00:00Z")

  test("moves one destination and leaves the others alone", () => {
    const next = applyReschedule(posts, {
      at,
      kind: "schedule",
      postId: "p1",
      targetId: "t1",
    })
    expect(next[0].targets[0].scheduledAt).toEqual(at)
    expect(next[0].targets[1].scheduledAt).toEqual(
      new Date("2026-09-12T03:00:00Z"),
    )
    expect(next[1]).toBe(posts[1])
    expect(posts[0].targets[0].scheduledAt).toEqual(
      new Date("2026-09-12T02:00:00Z"),
    )
  })

  test("unscheduling clears every time and returns the post to draft", () => {
    const [post] = applyReschedule(posts, {
      kind: "unschedule",
      postId: "p1",
      targetId: null,
    })
    expect(post.status).toBe("draft")
    expect(post.targets.every((t) => t.scheduledAt === null)).toBe(true)
  })

  test("scheduling a whole draft sets every destination and the post status", () => {
    const [draft] = applyReschedule(
      [
        makePost({
          id: "d",
          status: "draft",
          targets: [makeTarget({ id: "x" })],
        }),
      ],
      { at, kind: "schedule", postId: "d", targetId: null },
    )
    expect(draft.status).toBe("scheduled")
    expect(draft.targets[0].scheduledAt).toEqual(at)
  })
})

describe("a draft planned for a time", () => {
  const PLANNED = new Date("2026-09-12T02:00:00Z")
  const planned = makePost({
    id: "p-planned",
    status: "draft",
    targets: [
      makeTarget({ id: "t1", scheduledAt: PLANNED }),
      makeTarget({ id: "t2", scheduledAt: PLANNED }),
    ],
  })
  const unplanned = makePost({
    id: "p-unplanned",
    status: "draft",
    targets: [makeTarget({ id: "t3" })],
  })

  test("sits on its day as one non-draggable draft item", () => {
    const items = buildDatedItems([planned, unplanned])

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      at: PLANNED,
      isMovable: false,
      postId: "p-planned",
      status: "draft",
      targetId: null,
    })
  })

  test("is not listed under No date, while a draft without a time is", () => {
    const items = buildUndatedItems([planned, unplanned])

    expect(items.map((item) => item.postId)).toEqual(["p-unplanned"])
    expect(items[0].isMovable).toBe(true)
  })
})
