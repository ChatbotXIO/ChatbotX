import { act } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { CONNECT_REQUEST_TIMEOUT_MS } from "@/features/channel-connect/hooks/use-connect-batch"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"
import {
  cleanupProbe,
  getApi,
  type Item,
  items3,
  outcome,
  renderProbe,
} from "./use-connect-batch.test-utils"

afterEach(cleanupProbe)

describe("useConnectBatch", () => {
  test("processes rows waiting → connecting → done, in requested order, and reports counters", async () => {
    const connectOne = vi.fn(
      async (item: Item): Promise<ConnectActionResultWire> => ({
        kind: "outcome",
        outcome: {
          sourceId: item.id,
          name: item.name,
          status: "connected",
          coexistEligible: false,
        },
      }),
    )
    renderProbe({ items: items3, concurrency: 1, connectOne })

    expect(getApi().rows.get("a")).toEqual({ phase: "waiting" })

    await act(async () => {
      await getApi().run()
    })

    expect(connectOne).toHaveBeenCalledTimes(3)
    expect(connectOne.mock.calls.map((call) => call[0].id)).toEqual([
      "a",
      "b",
      "c",
    ])
    expect(getApi().total).toBe(3)
    expect(getApi().done).toBe(3)
    expect(getApi().connectedCount).toBe(3)
    expect(getApi().outcomes.map((o) => o.sourceId)).toEqual(["a", "b", "c"])
    expect(getApi().isRunning).toBe(false)
  })

  test("respects concurrency: never runs more than N connectOne calls at once", async () => {
    let active = 0
    let maxActive = 0
    const pending = new Map<string, (result: ConnectActionResultWire) => void>()
    const connectOne = vi.fn(
      (item: Item) =>
        new Promise<ConnectActionResultWire>((resolve) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          pending.set(item.id, (result) => {
            active -= 1
            resolve(result)
          })
        }),
    )

    renderProbe({ items: items3, concurrency: 2, connectOne })

    let runPromise!: Promise<void>
    act(() => {
      runPromise = getApi().run()
    })

    // Only "a" and "b" (concurrency 2) should have started; "c" is queued.
    expect(connectOne).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(2)

    for (const id of ["a", "b", "c"]) {
      await act(async () => {
        // Wait for this id's connectOne call to be registered (it only
        // starts once a slot frees up), then resolve it.
        while (!pending.has(id)) {
          await Promise.resolve()
        }
        pending.get(id)?.(
          outcome({
            outcome: {
              sourceId: id,
              name: id,
              status: "connected",
              coexistEligible: false,
            },
          } as never),
        )
        await Promise.resolve()
      })
    }

    await act(async () => {
      await runPromise
    })

    expect(maxActive).toBeLessThanOrEqual(2)
    expect(connectOne).toHaveBeenCalledTimes(3)
  })

  test("cancelRemaining stops queued rows from starting; in-flight rows still finish", async () => {
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const started: string[] = []
    const connectOne = vi.fn(
      async (item: Item): Promise<ConnectActionResultWire> => {
        started.push(item.id)
        if (item.id === "a") {
          await first
        }
        return outcome({
          outcome: {
            sourceId: item.id,
            name: item.name,
            status: "connected",
            coexistEligible: false,
          },
        } as never)
      },
    )

    renderProbe({ items: items3, concurrency: 1, connectOne })

    let runPromise!: Promise<void>
    act(() => {
      runPromise = getApi().run()
    })
    await act(async () => {
      await Promise.resolve()
    })

    // "a" is in flight (concurrency 1); cancel before it settles.
    act(() => {
      getApi().cancelRemaining()
    })

    await act(async () => {
      releaseFirst()
      await runPromise
    })

    expect(started).toEqual(["a"]) // "b"/"c" never started
    expect(getApi().rows.get("a")).toEqual({
      phase: "done",
      outcome: expect.objectContaining({ sourceId: "a" }),
    })
    expect(getApi().rows.get("b")).toEqual({ phase: "cancelled" })
    expect(getApi().rows.get("c")).toEqual({ phase: "cancelled" })
    expect(getApi().retryableIds.sort()).toEqual(["b", "c"])
  })

  test("cancelRemaining then retry re-runs only the cancelled rows and resets the abort flag", async () => {
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const connectOne = vi.fn(
      async (item: Item): Promise<ConnectActionResultWire> => {
        if (item.id === "a") {
          await first
        }
        return outcome({
          outcome: {
            sourceId: item.id,
            name: item.name,
            status: "connected",
            coexistEligible: false,
          },
        } as never)
      },
    )

    renderProbe({ items: items3, concurrency: 1, connectOne })

    let runPromise!: Promise<void>
    act(() => {
      runPromise = getApi().run()
    })
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      getApi().cancelRemaining()
    })
    await act(async () => {
      releaseFirst()
      await runPromise
    })

    expect(getApi().rows.get("a")?.phase).toBe("done")
    expect(getApi().rows.get("b")).toEqual({ phase: "cancelled" })
    expect(getApi().rows.get("c")).toEqual({ phase: "cancelled" })

    connectOne.mockClear()
    await act(async () => {
      await getApi().retry(["c"])
    })

    // retry() resets the abort flag, so "c" actually runs this time instead
    // of being marked cancelled again.
    expect(connectOne).toHaveBeenCalledTimes(1)
    expect(connectOne).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c" }),
    )
    expect(getApi().rows.get("a")?.phase).toBe("done")
    expect(getApi().rows.get("b")).toEqual({ phase: "cancelled" })
    expect(getApi().rows.get("c")).toEqual({
      phase: "done",
      outcome: expect.objectContaining({ sourceId: "c", status: "connected" }),
    })
  })

  test("retry on a row whose earlier attempt actually committed lands on duplicated", async () => {
    let call = 0
    const connectOne = vi.fn((item: Item): Promise<ConnectActionResultWire> => {
      call += 1
      if (call === 1) {
        // First attempt "fails" client-side (e.g. timed out) though the
        // server actually committed it.
        return Promise.resolve(
          outcome({
            outcome: {
              sourceId: item.id,
              name: item.name,
              status: "failed",
              reason: "unknown",
              coexistEligible: false,
            },
          } as never),
        )
      }
      return Promise.resolve(
        outcome({
          outcome: {
            sourceId: item.id,
            name: item.name,
            status: "duplicated",
            reason: "alreadyConnected",
            coexistEligible: false,
          },
        } as never),
      )
    })

    renderProbe({ items: [{ id: "a", name: "A" }], concurrency: 1, connectOne })
    await act(async () => {
      await getApi().run()
    })
    expect(getApi().rows.get("a")).toEqual({
      phase: "done",
      outcome: expect.objectContaining({ status: "failed" }),
    })

    await act(async () => {
      await getApi().retry(["a"])
    })
    expect(getApi().rows.get("a")).toEqual({
      phase: "done",
      outcome: expect.objectContaining({ status: "duplicated" }),
    })
  })

  test("a sessionError result stops the batch: sessionError is set, no new items start, remaining rows cancel", async () => {
    const started: string[] = []
    const connectOne = vi.fn((item: Item): Promise<ConnectActionResultWire> => {
      started.push(item.id)
      if (item.id === "a") {
        return Promise.resolve({ kind: "sessionError", code: "sessionExpired" })
      }
      return Promise.resolve(
        outcome({
          outcome: {
            sourceId: item.id,
            name: item.name,
            status: "connected",
            coexistEligible: false,
          },
        } as never),
      )
    })

    renderProbe({ items: items3, concurrency: 1, connectOne })
    await act(async () => {
      await getApi().run()
    })

    expect(getApi().sessionError).toBe("sessionExpired")
    expect(started).toEqual(["a"]) // "b"/"c" never dispatched
    expect(getApi().rows.get("a")).toEqual({ phase: "cancelled" })
    expect(getApi().rows.get("b")).toEqual({ phase: "cancelled" })
    expect(getApi().rows.get("c")).toEqual({ phase: "cancelled" })
  })

  test("sessionError is cleared once a retry actually runs, so a successful retry removes the Alert and stops skipping coexist on a stale code", async () => {
    let attempt = 0
    const connectOne = vi.fn((item: Item): Promise<ConnectActionResultWire> => {
      attempt += 1
      if (attempt === 1) {
        return Promise.resolve({ kind: "sessionError", code: "sessionExpired" })
      }
      return Promise.resolve(
        outcome({
          outcome: {
            sourceId: item.id,
            name: item.name,
            status: "connected",
            coexistEligible: false,
          },
        } as never),
      )
    })

    renderProbe({
      items: [{ id: "a", name: "A" }],
      concurrency: 1,
      connectOne,
    })
    await act(async () => {
      await getApi().run()
    })
    expect(getApi().sessionError).toBe("sessionExpired")

    await act(async () => {
      await getApi().retry(["a"])
    })

    expect(getApi().sessionError).toBeNull()
    expect(getApi().rows.get("a")).toEqual({
      phase: "done",
      outcome: expect.objectContaining({ status: "connected" }),
    })
  })

  test("retry is ignored while the batch is still running — it never starts a second concurrent run", async () => {
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let activeCalls = 0
    let maxActiveCalls = 0
    const connectOne = vi.fn(
      async (item: Item): Promise<ConnectActionResultWire> => {
        activeCalls += 1
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls)
        if (item.id === "a") {
          await first
        }
        activeCalls -= 1
        return outcome({
          outcome: {
            sourceId: item.id,
            name: item.name,
            status: "connected",
            coexistEligible: false,
          },
        } as never)
      },
    )

    renderProbe({ items: items3, concurrency: 1, connectOne })

    let runPromise!: Promise<void>
    act(() => {
      runPromise = getApi().run()
    })
    await act(async () => {
      await Promise.resolve()
    })

    // "a" is still in flight (concurrency 1) — a Retry click here must be a
    // no-op, not a second `mapWithConcurrency` run.
    connectOne.mockClear()
    let retryPromise!: Promise<void>
    act(() => {
      retryPromise = getApi().retry(["b"])
    })
    await act(async () => {
      await retryPromise
    })
    expect(connectOne).not.toHaveBeenCalled()
    // Retry did not reset "b" to "waiting" either — it stayed whatever it
    // already was (still queued behind "a" in the original run).
    expect(getApi().rows.get("b")).toEqual({ phase: "waiting" })

    await act(async () => {
      releaseFirst()
      await runPromise
    })

    expect(maxActiveCalls).toBe(1)
    expect(getApi().rows.get("a")?.phase).toBe("done")
    expect(getApi().rows.get("b")?.phase).toBe("done")
    expect(getApi().rows.get("c")?.phase).toBe("done")
  })

  test("a request exceeding CONNECT_REQUEST_TIMEOUT_MS becomes timedOut and is retryable; the batch still finishes", async () => {
    vi.useFakeTimers()
    const connectOne = vi.fn(
      () =>
        new Promise<ConnectActionResultWire>(() => {
          // never resolves
        }),
    )

    renderProbe({ items: [{ id: "a", name: "A" }], concurrency: 1, connectOne })

    let runPromise!: Promise<void>
    act(() => {
      runPromise = getApi().run()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONNECT_REQUEST_TIMEOUT_MS)
      await runPromise
    })

    expect(getApi().rows.get("a")).toEqual({ phase: "timedOut" })
    expect(getApi().retryableIds).toEqual(["a"])
    expect(getApi().isRunning).toBe(false)
  })

  test("a fast-settling request clears its per-request timeout timer instead of leaving it dangling for 60s", async () => {
    vi.useFakeTimers()
    const connectOne = vi.fn(
      async (item: Item): Promise<ConnectActionResultWire> =>
        outcome({
          outcome: {
            sourceId: item.id,
            name: item.name,
            status: "connected",
            coexistEligible: false,
          },
        } as never),
    )

    renderProbe({ items: [{ id: "a", name: "A" }], concurrency: 1, connectOne })

    await act(async () => {
      await getApi().run()
    })

    expect(getApi().rows.get("a")?.phase).toBe("done")
    expect(vi.getTimerCount()).toBe(0)
  })

  test("cancelRemaining during a permanently pending request still reaches a finished state after the timeout", async () => {
    vi.useFakeTimers()
    const connectOne = vi.fn(
      () =>
        new Promise<ConnectActionResultWire>(() => {
          // never resolves
        }),
    )

    renderProbe({ items: [{ id: "a", name: "A" }], concurrency: 1, connectOne })

    let runPromise!: Promise<void>
    act(() => {
      runPromise = getApi().run()
    })
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      getApi().cancelRemaining()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CONNECT_REQUEST_TIMEOUT_MS)
      await runPromise
    })

    // The in-flight row times out rather than being force-cancelled — it was
    // already past the abort check when cancelRemaining was called.
    expect(getApi().rows.get("a")).toEqual({ phase: "timedOut" })
    expect(getApi().isRunning).toBe(false)
  })

  test("the hook never reads a shared useAction result — each connectOne call settles with its own outcome, across separate run() calls", async () => {
    // The hook attaches no useAction callbacks (UseConnectBatchOptions.connectOne
    // is a plain function); two separate `run()` calls each get their own
    // result with no cross-talk / last-write-wins shared state. (A second
    // `run()` fired while the first is still in flight is now a no-op by
    // design — see the re-entrancy guard test above — so this exercises
    // sequential calls instead of overlapping ones.)
    const connectOne = vi.fn(
      async (item: Item): Promise<ConnectActionResultWire> =>
        outcome({
          outcome: {
            sourceId: item.id,
            name: item.name,
            status: "connected",
            coexistEligible: false,
          },
        } as never),
    )
    renderProbe({ items: items3, concurrency: 3, connectOne })

    await act(async () => {
      await getApi().run(["a"])
    })
    expect(getApi().rows.get("a")?.phase).toBe("done")
    expect(getApi().rows.get("b")).toEqual({ phase: "waiting" })

    await act(async () => {
      await getApi().run(["b", "c"])
    })
    expect(getApi().rows.get("a")?.phase).toBe("done")
    expect(getApi().rows.get("b")?.phase).toBe("done")
    expect(getApi().rows.get("c")?.phase).toBe("done")
  })
})
