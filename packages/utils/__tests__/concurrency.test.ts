import { afterEach, describe, expect, test, vi } from "vitest"
import {
  createConcurrencyLimiter,
  mapWithConcurrency,
  withTimeout,
} from "../src/concurrency"

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

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("resolves with the value and leaves no timer behind when the work is fast", async () => {
    vi.useFakeTimers()

    await expect(withTimeout(Promise.resolve("ok"), 250)).resolves.toBe("ok")
    expect(vi.getTimerCount()).toBe(0)
  })

  test("rejects once the deadline passes while the work is still pending", async () => {
    vi.useFakeTimers()
    // Work that never settles: the promise is intentionally pending forever.
    const outcome = withTimeout(new Promise<never>(() => undefined), 250).then(
      () => "resolved",
      (error: Error) => error.message,
    )

    await vi.advanceTimersByTimeAsync(250)

    await expect(outcome).resolves.toBe("Timed out after 250ms")
  })

  test("passes the work's own rejection through", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("db down")), 250),
    ).rejects.toThrow("db down")
  })

  test("handles a rejection that arrives after the deadline", async () => {
    vi.useFakeTimers()
    let rejectLate: (reason: Error) => void = () => undefined
    const late = new Promise<never>((_, reject) => {
      rejectLate = reject
    })
    const outcome = withTimeout(late, 100).then(
      () => "resolved",
      (error: Error) => error.message,
    )

    await vi.advanceTimersByTimeAsync(100)
    await expect(outcome).resolves.toBe("Timed out after 100ms")
    rejectLate(new Error("too late"))
    await vi.advanceTimersByTimeAsync(1)
  })
})

describe("createConcurrencyLimiter", () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

  test("caps concurrent work across every caller", async () => {
    const run = createConcurrencyLimiter(2)
    let active = 0
    let maxActive = 0
    const work = async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await tick()
      active -= 1
    }

    await Promise.all(Array.from({ length: 6 }, () => run(work)))

    expect(maxActive).toBe(2)
  })

  test("starts work at once, in the caller's turn, when a slot is free", async () => {
    const run = createConcurrencyLimiter(1)
    const order: string[] = []

    const done = run(() => {
      order.push("work")
      return Promise.resolve()
    })
    order.push("caller")
    await done

    expect(order).toEqual(["work", "caller"])
  })

  test("starts waiting work in order", async () => {
    const run = createConcurrencyLimiter(1)
    const order: number[] = []

    await Promise.all(
      [1, 2, 3].map((item) =>
        run(async () => {
          order.push(item)
          await tick()
        }),
      ),
    )

    expect(order).toEqual([1, 2, 3])
  })

  test("frees the slot when work throws", async () => {
    const run = createConcurrencyLimiter(1)

    await expect(run(() => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    )
    await expect(run(async () => "next")).resolves.toBe("next")
  })

  test("a caller that gives up while waiting leaves the queue without a slot", async () => {
    const run = createConcurrencyLimiter(1)
    let releaseFirst: (() => void) | undefined
    const first = run(
      () => new Promise<void>((resolve) => (releaseFirst = resolve)),
    )
    const controller = new AbortController()
    const gaveUp = run(async () => "never", { signal: controller.signal })

    controller.abort(new Error("deadline"))

    await expect(gaveUp).rejects.toThrow("deadline")
    releaseFirst?.()
    await first
    await expect(run(async () => "next")).resolves.toBe("next")
  })

  test("a signal already aborted rejects at once when the cap is reached", async () => {
    const run = createConcurrencyLimiter(1)
    let releaseFirst: (() => void) | undefined
    const first = run(
      () => new Promise<void>((resolve) => (releaseFirst = resolve)),
    )
    const controller = new AbortController()
    controller.abort(new Error("late"))

    await expect(
      run(async () => "never", { signal: controller.signal }),
    ).rejects.toThrow("late")
    releaseFirst?.()
    await first
  })
})
