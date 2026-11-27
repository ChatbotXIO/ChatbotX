// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  REMOVAL_POLL_CAP_MS,
  REMOVAL_POLL_INTERVAL_MS,
  useRemovalTracker,
} from "@/features/social-posts/hooks/use-removal-tracker"
import type { ComposerPost } from "@/features/social-posts/lib/composer-state"

type Tracker = ReturnType<typeof useRemovalTracker>
type Row = { errorCode?: string; removed?: boolean }

const postWith = (rows: Record<string, Row>): ComposerPost =>
  ({
    id: "p1",
    targets: ["t1", "t2"].map((id) => ({
      errorCode: rows[id]?.errorCode ?? null,
      id,
      removedAt: rows[id]?.removed ? "2026-01-01T00:00:00.000Z" : null,
    })),
  }) as unknown as ComposerPost

let root: Root
let tracker: Tracker
let current: ComposerPost
const refetch = vi.fn<() => Promise<boolean>>()

function Probe({ post }: { post: ComposerPost }) {
  tracker = useRemovalTracker({ post, refetch })
  return null
}
const show = () => act(() => root.render(<Probe post={current} />))
const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
    await vi.advanceTimersByTimeAsync(2)
  })
  await act(async () => await Promise.resolve())
}

/** Each read answers after `latencyMs` with what `serverAt(n)` holds for read n. */
const serve = (
  latencyMs: number,
  serverAt: (read: number) => Record<string, Row>,
) => {
  let reads = 0
  refetch.mockImplementation(async () => {
    reads += 1
    const rows = serverAt(reads)
    await new Promise((resolve) => setTimeout(resolve, latencyMs))
    current = postWith(rows)
    root.render(<Probe post={current} />)
    return true
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  refetch.mockReset()
  current = postWith({})
  root = createRoot(document.createElement("div"))
  show()
})
afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

describe("useRemovalTracker", () => {
  test("two queued targets: the first ends on read 1, the second on read 3, then polling stops", async () => {
    serve(1, (read) => ({
      t1: { removed: read >= 1 },
      t2: { removed: read >= 3 },
    }))
    act(() => tracker.track(["t1", "t2"]))
    expect([...tracker.removing]).toEqual(["t1", "t2"])

    await tick(REMOVAL_POLL_INTERVAL_MS)
    expect([...tracker.removing]).toEqual(["t2"])
    await tick(REMOVAL_POLL_INTERVAL_MS * 2)
    expect(refetch).toHaveBeenCalledTimes(3)
    expect(tracker.removing.size).toBe(0)

    await tick(REMOVAL_POLL_CAP_MS)
    expect(refetch).toHaveBeenCalledTimes(3)
  })

  test("a read slower than the interval is never cancelled or overlapped, and its answer is used", async () => {
    serve(REMOVAL_POLL_INTERVAL_MS * 2, () => ({ t1: { removed: true } }))
    act(() => tracker.track(["t1"]))

    await tick(REMOVAL_POLL_INTERVAL_MS * 2)
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(tracker.removing.has("t1")).toBe(true)
    await tick(REMOVAL_POLL_INTERVAL_MS + 1000)
    // One read started at 3 s and answered at 9 s; no second read began meanwhile.
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(tracker.removing.size).toBe(0)
    await tick(REMOVAL_POLL_INTERVAL_MS * 2)
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  test("a target that never ends is polled for 60 s at most", async () => {
    serve(1, () => ({}))
    act(() => tracker.track(["t1"]))

    await tick(REMOVAL_POLL_CAP_MS)
    await tick(REMOVAL_POLL_INTERVAL_MS * 5)

    expect(refetch).toHaveBeenCalledTimes(
      REMOVAL_POLL_CAP_MS / REMOVAL_POLL_INTERVAL_MS - 1,
    )
    expect(tracker.removing.size).toBe(0)
  })

  test("an error on the row ends the wait only after a read that follows the request", async () => {
    // The page still shows the previous attempt's error when the request is queued.
    current = postWith({ t1: { errorCode: "removalQuotaExhausted" } })
    show()
    serve(1, () => ({ t1: { errorCode: "removalQuotaExhausted" } }))
    act(() => tracker.track(["t1"]))
    expect(tracker.removing.has("t1")).toBe(true)

    await tick(REMOVAL_POLL_INTERVAL_MS)
    expect(tracker.removing.size).toBe(0)
  })

  test("a failed read does not arm the tracker; the stale error keeps the row waiting until a read succeeds", async () => {
    current = postWith({ t1: { errorCode: "removalQuotaExhausted" } })
    show()
    let reads = 0
    refetch.mockImplementation(() => {
      reads += 1
      return Promise.resolve(reads > 1)
    })
    act(() => tracker.track(["t1"]))

    await tick(REMOVAL_POLL_INTERVAL_MS)
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(tracker.removing.has("t1")).toBe(true)

    await tick(REMOVAL_POLL_INTERVAL_MS)
    expect(tracker.removing.size).toBe(0)
  })

  test("two consecutive identical failures each end their own wait", async () => {
    const sameFailure = { t1: { errorCode: "removalQuotaExhausted" } }
    serve(1, () => sameFailure)

    act(() => tracker.track(["t1"]))
    await tick(REMOVAL_POLL_INTERVAL_MS)
    expect(tracker.removing.size).toBe(0)

    // The second request clears the error on the server; the page has not read that yet.
    act(() => tracker.track(["t1"]))
    expect(tracker.removing.has("t1")).toBe(true)
    await tick(REMOVAL_POLL_INTERVAL_MS)
    expect(tracker.removing.size).toBe(0)
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  test("unmounting stops the polling", async () => {
    serve(1, () => ({}))
    act(() => tracker.track(["t1"]))
    act(() => root.unmount())
    await tick(REMOVAL_POLL_CAP_MS)
    expect(refetch).not.toHaveBeenCalled()
    root = createRoot(document.createElement("div"))
  })
})
