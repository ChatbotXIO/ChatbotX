import { describe, expect, test } from "vitest"
import { mapWithConcurrency } from "../src/concurrency"

describe("mapWithConcurrency", () => {
  test("respects the concurrency cap", async () => {
    let active = 0
    let maxActive = 0
    const items = Array.from({ length: 10 }, (_, index) => index)

    await mapWithConcurrency(items, 3, async (item) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return item
    })

    expect(maxActive).toBeLessThanOrEqual(3)
    expect(maxActive).toBeGreaterThan(1)
  })

  test("preserves per-item results in input order", async () => {
    const items = [3, 1, 2]

    const results = await mapWithConcurrency(items, 2, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, item))
      return item * 10
    })

    expect(results).toEqual([
      { status: "fulfilled", value: 30 },
      { status: "fulfilled", value: 10 },
      { status: "fulfilled", value: 20 },
    ])
  })

  test("isolates per-item failures instead of aborting the others", async () => {
    const items = ["ok-1", "fail", "ok-2"]

    const results = await mapWithConcurrency(items, 2, (item) => {
      if (item === "fail") {
        return Promise.reject(new Error("boom"))
      }
      return Promise.resolve(item)
    })

    expect(results[0]).toEqual({ status: "fulfilled", value: "ok-1" })
    expect(results[1]).toMatchObject({ status: "rejected" })
    expect(results[2]).toEqual({ status: "fulfilled", value: "ok-2" })
  })

  test("returns [] for an empty input without calling fn", async () => {
    let called = false

    const results = await mapWithConcurrency([], 5, (item) => {
      called = true
      return Promise.resolve(item)
    })

    expect(results).toEqual([])
    expect(called).toBe(false)
  })

  test("never runs more concurrently than the item count", async () => {
    let active = 0
    let maxActive = 0

    await mapWithConcurrency([1, 2], 10, async (item) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return item
    })

    expect(maxActive).toBe(2)
  })
})
