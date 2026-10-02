import { describe, expect, test } from "vitest"
import {
  applyToAllPollInterval,
  toApplyToAllStatus,
  toBulkRunResource,
} from "../src/features/integration-ai-handover/lib/bulk-run-resource"
import { setApplyToAllRequest } from "../src/features/integration-ai-handover/schema/bulk"

describe("setApplyToAllRequest", () => {
  test("an ON needs no message", () => {
    expect(
      setApplyToAllRequest.safeParse({
        applyToAllCustomers: true,
        message: "",
      }).success,
    ).toBe(true)
  })

  test.each([
    "",
    "   ",
    "\n\t",
  ])("an OFF with the blank message %j is rejected on the message field", (message) => {
    const result = setApplyToAllRequest.safeParse({
      applyToAllCustomers: false,
      message,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(["message"])
  })

  test("an OFF accepts up to 2000 characters and rejects more", () => {
    const off = (message: string) =>
      setApplyToAllRequest.safeParse({ applyToAllCustomers: false, message })
        .success

    expect(off("a".repeat(2000))).toBe(true)
    expect(off("a".repeat(2001))).toBe(false)
  })
})

const RUN = {
  id: "run-1",
  action: "disable",
  status: "completed",
  message: "hi",
  requestedAt: new Date("2026-10-02T10:00:00Z"),
  startedAt: null,
  finishedAt: null,
  processedCount: 3,
  skippedCount: 1,
  failedCount: 2,
  totalCount: 6,
  currentError: null,
  pausedUntil: null,
} as never

describe("toBulkRunResource", () => {
  test("shows the requester's name, falling back to the email", () => {
    expect(
      toBulkRunResource(RUN, { name: "Linh", email: "l@x.io" }).requestedByName,
    ).toBe("Linh")
    expect(
      toBulkRunResource(RUN, { name: null, email: "l@x.io" }).requestedByName,
    ).toBe("l@x.io")
  })

  test("a deleted requester (set null) has no name", () => {
    expect(toBulkRunResource(RUN, null).requestedByName).toBeNull()
    expect(toBulkRunResource(RUN).requestedByName).toBeNull()
  })

  test("a live run with a future pausedUntil is paused until then", () => {
    const now = new Date("2026-10-02T12:00:00Z")
    const resumeAt = new Date("2026-10-02T13:00:00Z")
    const live = {
      ...(RUN as object),
      status: "running",
      pausedUntil: resumeAt,
    } as never

    expect(toBulkRunResource(live, null, now).pausedUntil).toEqual(resumeAt)
  })

  test("an elapsed pause, or a finished run, is not paused", () => {
    const now = new Date("2026-10-02T12:00:00Z")
    const elapsed = {
      ...(RUN as object),
      status: "running",
      pausedUntil: new Date("2026-10-02T11:59:00Z"),
    } as never
    const finished = {
      ...(RUN as object),
      status: "completed",
      pausedUntil: new Date("2026-10-02T12:30:00Z"),
    } as never

    expect(toBulkRunResource(elapsed, null, now).pausedUntil).toBeNull()
    expect(toBulkRunResource(finished, null, now).pausedUntil).toBeNull()
  })

  test("carries the counters through unchanged", () => {
    expect(toBulkRunResource(RUN)).toMatchObject({
      processedCount: 3,
      skippedCount: 1,
      failedCount: 2,
      totalCount: 6,
    })
  })
})

describe("toApplyToAllStatus", () => {
  test("a Page never switched is idle with no run", () => {
    expect(
      toApplyToAllStatus(
        { applyToAllCustomers: false, revision: 0, run: null },
        false,
      ),
    ).toEqual({
      status: "idle",
      applyToAllCustomers: false,
      isAutomationActive: false,
      run: null,
    })
  })

  test("a stored change without its run yet is reconciling", () => {
    expect(
      toApplyToAllStatus(
        { applyToAllCustomers: true, revision: 2, run: null },
        true,
      ).status,
    ).toBe("reconciling")
  })

  test("otherwise the status is the run's, and the switch is the desired state", () => {
    const result = toApplyToAllStatus(
      {
        applyToAllCustomers: true,
        revision: 2,
        run: { ...(RUN as object), status: "running" } as never,
      },
      true,
    )

    expect(result).toMatchObject({
      status: "running",
      applyToAllCustomers: true,
      isAutomationActive: true,
    })
    expect(result.run?.id).toBe("run-1")
  })
})

describe("applyToAllPollInterval", () => {
  const query = (status: string | undefined, isAutomationActive = true) => ({
    state: {
      data: status ? ({ status, isAutomationActive } as never) : undefined,
    },
  })

  test.each([
    "pending",
    "running",
    "cancelling",
  ])("keeps polling while the run is %s, however long the query has lived", (status) => {
    expect(applyToAllPollInterval(query(status), 0)).toBe(5000)
    expect(applyToAllPollInterval(query(status), 3_600_000)).toBe(5000)
  })

  test.each([
    "completed",
    "failed",
    "cancelled",
    "idle",
  ])("stops once the state is %s", (status) => {
    expect(applyToAllPollInterval(query(status), 0)).toBe(false)
  })

  test("polls a stored change waiting for its run fast at first, then slowly, and never gives up", () => {
    expect(applyToAllPollInterval(query("reconciling"), 0)).toBe(5000)
    expect(applyToAllPollInterval(query("reconciling"), 59_000)).toBe(5000)
    // It may wait long: an opposite run winding down, an ON until its schedule.
    expect(applyToAllPollInterval(query("reconciling"), 60_000)).toBe(30_000)
    expect(applyToAllPollInterval(query("reconciling"), 24 * 3_600_000)).toBe(
      30_000,
    )
  })

  test("a settled Page whose automation does not run checks back every minute, so a schedule window that opens unlocks the switch", () => {
    for (const status of ["idle", "completed", "failed", "cancelled"]) {
      expect(applyToAllPollInterval(query(status, false), 0)).toBe(60_000)
      expect(applyToAllPollInterval(query(status, true), 0)).toBe(false)
    }
  })

  test("does not poll before any data arrived", () => {
    expect(applyToAllPollInterval(query(undefined), 0)).toBe(false)
  })
})
