import { describe, expect, test } from "vitest"
import { materializeBatchJobId } from "../src/queues/broadcast-recurrence"
import { broadcastPrepareJobId } from "../src/queues/schedule"

describe("broadcast job ids", () => {
  // Producers in different processes (and different deploy versions) must build
  // the same id, or the same run is prepared twice.
  test("the prepare id keeps the format enqueueBroadcast has always used", () => {
    expect(broadcastPrepareJobId("123")).toBe("schedule-prepare-broadcast-123")
  })

  test("a recurrence batch id is deterministic per tick, page and chunk, and BullMQ-safe", () => {
    const id = materializeBatchJobId(1_760_320_800_000, 2, 3)
    expect(id).toBe("broadcast-recurrence-1760320800000-2-3")
    expect(id).not.toContain(":")
    expect(materializeBatchJobId(1_760_320_800_000, 2, 4)).not.toBe(id)
  })
})
