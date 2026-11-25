// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  FEED_RUN_MESSAGES,
  feedRunLines,
} from "@/features/social-post-feeds/lib/feed-run-summary"

const base = {
  created: 0,
  fresh: 0,
  items: 0,
  kind: "checked" as const,
  refused: 0,
  staleRetries: 0,
  waiting: 0,
}

describe("feedRunLines", () => {
  test("never checked or failed: nothing to add", () => {
    expect(feedRunLines(null)).toEqual([])
    expect(feedRunLines({ ...base, kind: "failed" })).toEqual([])
  })

  test("an older copy and an unchanged source have their own line", () => {
    expect(feedRunLines({ ...base, kind: "stale", staleRetries: 1 })).toEqual([
      { key: "stale" },
    ])
    expect(feedRunLines({ ...base, kind: "notModified" })).toEqual([
      { key: "notModified" },
    ])
  })

  test("a check with no new items says so", () => {
    expect(feedRunLines({ ...base, items: 48 })).toEqual([{ key: "noNew" }])
  })

  test("posts made, refused and waiting items are listed with their counts", () => {
    expect(
      feedRunLines({ ...base, created: 2, fresh: 9, refused: 1, waiting: 6 }),
    ).toEqual([
      { count: 2, key: "created" },
      { count: 1, key: "refused" },
      { count: 6, key: "waiting" },
    ])
  })

  test("items held back by the daily cap get their own line with the cap and the next free time", () => {
    const nextSlotAt = "2026-01-02T10:00:00.000Z"
    expect(
      feedRunLines(
        {
          ...base,
          dailyCap: 10,
          fresh: 4,
          nextSlotAt,
          waiting: 4,
          waitingReason: "dailyCap",
        },
        Date.parse("2026-01-02T09:00:00.000Z"),
      ),
    ).toEqual([{ cap: 10, count: 4, key: "dailyCap", until: nextSlotAt }])
    expect(
      feedRunLines({
        ...base,
        dailyCap: 10,
        fresh: 4,
        waiting: 4,
        waitingReason: "dailyCap",
      }),
    ).toEqual([{ cap: 10, count: 4, key: "dailyCap" }])
  })

  test("a next free time already in the past is left out", () => {
    const summary = {
      ...base,
      dailyCap: 10,
      fresh: 4,
      nextSlotAt: "2026-01-02T10:00:00.000Z",
      waiting: 4,
      waitingReason: "dailyCap" as const,
    }
    expect(
      feedRunLines(summary, Date.parse("2026-01-02T11:00:00.000Z")),
    ).toEqual([{ cap: 10, count: 4, key: "dailyCap" }])
    expect(
      feedRunLines(summary, Date.parse("2026-01-02T09:00:00.000Z")),
    ).toEqual([
      { cap: 10, count: 4, key: "dailyCap", until: "2026-01-02T10:00:00.000Z" },
    ])
  })

  test("a row saved before the reason existed keeps the generic waiting line", () => {
    expect(feedRunLines({ ...base, fresh: 3, waiting: 3 })).toEqual([
      { count: 3, key: "waiting" },
    ])
  })

  test("new items that were only skipped (old or filtered) are not reported as 'no new items'", () => {
    expect(feedRunLines({ ...base, fresh: 4 })).toEqual([
      { key: "skippedOnly" },
    ])
  })

  test("every line has a message key", () => {
    for (const key of Object.keys(FEED_RUN_MESSAGES)) {
      expect(
        FEED_RUN_MESSAGES[key as keyof typeof FEED_RUN_MESSAGES],
      ).toContain("posts.feeds.lastRun.")
    }
  })
})
