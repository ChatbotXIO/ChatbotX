// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  hasActiveSync,
  SYNC_POLL_INTERVAL_MS,
  syncCompletedSince,
  syncJustSettled,
  syncMarkersOf,
  syncRefetchInterval,
} from "../src/features/channel-posts/lib/sync-polling"

const idle = [{ status: "idle" as const }]
const running = [{ status: "idle" as const }, { status: "running" as const }]
const queued = [{ status: "queued" as const }]
const failed = [{ status: "failed" as const }]

describe("channel post sync polling", () => {
  test("polls while any inbox is queued or running", () => {
    expect(syncRefetchInterval(running)).toBe(SYNC_POLL_INTERVAL_MS)
    expect(syncRefetchInterval(queued)).toBe(SYNC_POLL_INTERVAL_MS)
  })

  test("stops polling once every inbox is idle or failed, or nothing loaded", () => {
    expect(syncRefetchInterval(idle)).toBe(false)
    expect(syncRefetchInterval(failed)).toBe(false)
    expect(syncRefetchInterval(undefined)).toBe(false)
    expect(hasActiveSync([])).toBe(false)
  })

  test("settles when a sync that was active finishes or fails", () => {
    expect(syncJustSettled(true, idle)).toBe(true)
    expect(syncJustSettled(true, failed)).toBe(true)
  })

  test("does not settle while still active, when never active, or before data", () => {
    expect(syncJustSettled(true, running)).toBe(false)
    expect(syncJustSettled(false, idle)).toBe(false)
    expect(syncJustSettled(true, undefined)).toBe(false)
  })
})

describe("a sync that finished unseen", () => {
  const row = (lastSyncedAt: Date | null) => ({
    inboxId: "i1",
    lastSyncedAt,
    status: "idle" as const,
  })

  test("detects a completion time that moved while never seen active", () => {
    // List read before the sync ended; status read after: idle both times.
    const before = syncMarkersOf([row(null)])

    expect(syncCompletedSince(before, [row(new Date("2026-10-01"))])).toBe(true)
    expect(
      syncCompletedSince(syncMarkersOf([row(new Date("2026-10-01"))]), [
        row(new Date("2026-10-02")),
      ]),
    ).toBe(true)
  })

  test("ignores an unchanged marker, the first read and an inbox seen first now", () => {
    const at = new Date("2026-10-01")

    expect(syncCompletedSince(syncMarkersOf([row(at)]), [row(at)])).toBe(false)
    expect(syncCompletedSince(null, [row(at)])).toBe(false)
    expect(syncCompletedSince(new Map(), [row(at)])).toBe(false)
  })
})
