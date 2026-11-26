// @vitest-environment node
import { describe, expect, test } from "vitest"
import { selectMetricsRefreshIds } from "@/features/channel-posts/lib/metrics-refresh-selection"

const MINUTE = 60_000
const NOW = 10 * 60 * MINUTE

describe("selectMetricsRefreshIds", () => {
  test("asks for every visible post the first time and stamps them", () => {
    const { ids, next } = selectMetricsRefreshIds({
      askedAt: new Map(),
      nowMs: NOW,
      visibleIds: ["1", "2"],
    })

    expect(ids).toEqual(["1", "2"])
    expect(Object.fromEntries(next)).toEqual({ "1": NOW, "2": NOW })
  })

  test("a post asked for less than 5 minutes ago is not asked again", () => {
    const { ids } = selectMetricsRefreshIds({
      askedAt: new Map([["1", NOW - 4 * MINUTE]]),
      nowMs: NOW,
      visibleIds: ["1", "2"],
    })

    expect(ids).toEqual(["2"])
  })

  test("a post asked for 5 minutes ago is asked again", () => {
    const { ids } = selectMetricsRefreshIds({
      askedAt: new Map([["1", NOW - 5 * MINUTE]]),
      nowMs: NOW,
      visibleIds: ["1"],
    })

    expect(ids).toEqual(["1"])
  })

  test("a second call with the same rows asks for nothing (once per batch)", () => {
    const first = selectMetricsRefreshIds({
      askedAt: new Map(),
      nowMs: NOW,
      visibleIds: ["1", "2"],
    })
    const second = selectMetricsRefreshIds({
      askedAt: first.next,
      nowMs: NOW + MINUTE,
      visibleIds: ["1", "2"],
    })

    expect(second.ids).toEqual([])
  })

  test("at most 50 ids go in one request; the rest wait for the next pass", () => {
    const visibleIds = Array.from({ length: 60 }, (_, index) => String(index))

    const first = selectMetricsRefreshIds({
      askedAt: new Map(),
      nowMs: NOW,
      visibleIds,
    })
    const second = selectMetricsRefreshIds({
      askedAt: first.next,
      nowMs: NOW,
      visibleIds,
    })

    expect(first.ids).toHaveLength(50)
    expect(second.ids).toEqual(visibleIds.slice(50))
  })

  test("the record keeps only the visible ids, so it never grows past the page", () => {
    const { next } = selectMetricsRefreshIds({
      askedAt: new Map([
        ["gone", NOW - MINUTE],
        ["1", NOW - MINUTE],
      ]),
      nowMs: NOW,
      visibleIds: ["1"],
    })

    expect([...next.keys()]).toEqual(["1"])
  })
})
