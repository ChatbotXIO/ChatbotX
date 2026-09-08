import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { CONNECT_REQUEST_TIMEOUT_MS } from "@/features/channel-connect/hooks/use-connect-batch"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"
import {
  cleanupProbe,
  getApi,
  type Item,
  renderProbe,
} from "./use-connect-batch.test-utils"

afterEach(cleanupProbe)

describe("useConnectBatch (parallelism)", () => {
  const items5: Item[] = ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    name: id.toUpperCase(),
  }))

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  })

  test("runs at most `concurrency` connects at once, and starts the next only when one settles", async () => {
    const resolvers = new Map<string, () => void>()
    let inFlight = 0
    let peakInFlight = 0
    const started: string[] = []

    const connectOne = vi.fn(
      (item: Item) =>
        new Promise<ConnectActionResultWire>((resolve) => {
          started.push(item.id)
          inFlight += 1
          peakInFlight = Math.max(peakInFlight, inFlight)
          resolvers.set(item.id, () => {
            resolvers.delete(item.id)
            inFlight -= 1
            resolve({
              kind: "outcome",
              outcome: {
                sourceId: item.id,
                name: item.name,
                status: "connected",
                coexistEligible: false,
              },
            })
          })
        }),
    )

    renderProbe({ items: items5, concurrency: 3, connectOne })

    let running: Promise<void> | undefined
    await act(async () => {
      running = getApi().run()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Three at once — not one, and not all five.
    expect(started).toEqual(["a", "b", "c"])
    expect(peakInFlight).toBe(3)

    await act(async () => {
      resolvers.get("b")?.()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // The fourth waited for a free slot, then took it.
    expect(started).toEqual(["a", "b", "c", "d"])
    expect(peakInFlight).toBe(3)

    // Drain whatever is pending, letting each freed slot pull the next row
    // in, until the batch reports itself finished.
    await act(async () => {
      const deadline = Date.now() + 2000
      while (getApi().isRunning && Date.now() < deadline) {
        for (const settle of [...resolvers.values()]) {
          settle()
        }
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      await running
    })

    expect(started).toEqual(["a", "b", "c", "d", "e"])
    expect(getApi().connectedCount).toBe(5)
  })

  test("a row that times out leaves the rows overlapping it untouched, and only queued rows cancel", async () => {
    vi.useFakeTimers()
    const resolvers = new Map<string, () => void>()
    const connectOne = vi.fn(
      (item: Item) =>
        new Promise<ConnectActionResultWire>((resolve) => {
          resolvers.set(item.id, () =>
            resolve({
              kind: "outcome",
              outcome: {
                sourceId: item.id,
                name: item.name,
                status: "connected",
                coexistEligible: false,
              },
            }),
          )
        }),
    )

    renderProbe({ items: items5, concurrency: 3, connectOne })

    let running: Promise<void> | undefined
    await act(async () => {
      running = getApi().run()
      await Promise.resolve()
      await Promise.resolve()
    })

    // "a"/"b"/"c" overlap; "d"/"e" are queued.
    getApi().cancelRemaining()

    // Only "a" is left hanging past the per-item timeout; "b" and "c" answer.
    await act(async () => {
      resolvers.get("b")?.()
      resolvers.get("c")?.()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONNECT_REQUEST_TIMEOUT_MS + 1)
      await running
    })

    // The timeout is per row: its two overlapping neighbours still connected.
    expect(getApi().rows.get("a")).toEqual({ phase: "timedOut" })
    expect(getApi().rows.get("b")).toMatchObject({ phase: "done" })
    expect(getApi().rows.get("c")).toMatchObject({ phase: "done" })
    // Cancel only reaches rows that had not started.
    expect(getApi().rows.get("d")).toEqual({ phase: "cancelled" })
    expect(getApi().rows.get("e")).toEqual({ phase: "cancelled" })
    expect(connectOne).toHaveBeenCalledTimes(3)
    expect(getApi().retryableIds).toEqual(["a", "d", "e"])
  })

  test("a lost app session mid-batch cancels the rows that had not started", async () => {
    // What `connectViaApi` turns a 401/403 into. Every remaining row would
    // fail the same way, so the batch must stop rather than offer N retries.
    const connectOne = vi.fn(
      (item: Item): Promise<ConnectActionResultWire> =>
        Promise.resolve(
          item.id === "b"
            ? { kind: "sessionError", code: "sessionExpired" }
            : {
                kind: "outcome",
                outcome: {
                  sourceId: item.id,
                  name: item.name,
                  status: "connected",
                  coexistEligible: false,
                },
              },
        ),
    )

    renderProbe({ items: items5, concurrency: 1, connectOne })

    await act(async () => {
      await getApi().run()
    })

    expect(getApi().sessionError).toBe("sessionExpired")
    expect(getApi().rows.get("a")).toMatchObject({ phase: "done" })
    expect(getApi().rows.get("b")).toEqual({ phase: "cancelled" })
    // "c"/"d"/"e" never ran — the abort flag stops the remaining workers.
    expect(connectOne).toHaveBeenCalledTimes(2)
    for (const id of ["c", "d", "e"]) {
      expect(getApi().rows.get(id)).toEqual({ phase: "cancelled" })
    }
  })
})
