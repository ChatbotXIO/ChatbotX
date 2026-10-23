import { describe, expect, it, vi } from "vitest"

const { createPresenceReporter } = await import("../src/lib/presence-reporter")

type Deferred = { promise: Promise<void>; resolve: () => void }

const createDeferred = (): Deferred => {
  const { promise, resolve } = Promise.withResolvers<void>()
  return { promise, resolve: () => resolve() }
}

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

const createHarness = (options: {
  concurrency: number
  usersByWorkspace: Map<string, string[]>
  reportFor?: (workspaceId: string) => Promise<void>
  isAccepted?: (workspaceId: string) => boolean
}) => {
  const reported: string[] = []
  const reportedUserIds = new Map<string, string[]>()
  let clock = 0
  const report = vi.fn(async (workspaceId: string, userIds: string[]) => {
    reported.push(workspaceId)
    reportedUserIds.set(workspaceId, userIds)
    await options.reportFor?.(workspaceId)
    return options.isAccepted?.(workspaceId) ?? true
  })
  const reporter = createPresenceReporter({
    concurrency: options.concurrency,
    getConnectedWorkspaceIds: () => options.usersByWorkspace.keys(),
    getUserIds: (workspaceId) =>
      options.usersByWorkspace.get(workspaceId) ?? [],
    now: () => {
      clock += 1
      return clock
    },
    report,
  })
  return { report, reported, reportedUserIds, reporter }
}

describe("createPresenceReporter", () => {
  it("does not let one slow workspace delay the others (no chunk head-of-line blocking)", async () => {
    const slow = createDeferred()
    const usersByWorkspace = new Map(
      Array.from({ length: 40 }, (_, index) => [`ws_${index}`, ["u"]]),
    )
    const { reported, reporter } = createHarness({
      concurrency: 4,
      reportFor: (workspaceId) =>
        workspaceId === "ws_0" ? slow.promise : Promise.resolve(),
      usersByWorkspace,
    })

    reporter.sweep()
    await vi.waitFor(() => expect(reported).toHaveLength(40))

    expect(new Set(reported).size).toBe(40)
    slow.resolve()
    reporter.stop()
  })

  it("never exceeds the configured concurrency", async () => {
    const gates = new Map<string, Deferred>()
    const usersByWorkspace = new Map(
      Array.from({ length: 10 }, (_, index) => [`ws_${index}`, ["u"]]),
    )
    let active = 0
    let maxActive = 0
    const { reported, reporter } = createHarness({
      concurrency: 3,
      reportFor: async (workspaceId) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        const gate = createDeferred()
        gates.set(workspaceId, gate)
        await gate.promise
        active -= 1
      },
      usersByWorkspace,
    })

    reporter.sweep()
    await flushMicrotasks()
    expect(reported).toHaveLength(3)

    for (let released = 0; released < 10; released += 1) {
      const next = [...gates.entries()].find(
        ([workspaceId]) =>
          reported.includes(workspaceId) && gates.has(workspaceId),
      )
      next?.[1].resolve()
      gates.delete(next?.[0] ?? "")
      await flushMicrotasks()
    }

    expect(maxActive).toBeLessThanOrEqual(3)
    expect(reported).toHaveLength(10)
    reporter.stop()
  })

  it("reports the stalest workspace first on a sweep", async () => {
    const usersByWorkspace = new Map([
      ["ws_a", ["u"]],
      ["ws_b", ["u"]],
      ["ws_c", ["u"]],
    ])
    const { reported, reporter } = createHarness({
      concurrency: 1,
      usersByWorkspace,
    })

    reporter.reportNow("ws_c")
    reporter.reportNow("ws_a")
    await vi.waitFor(() => expect(reported).toHaveLength(2))
    reported.length = 0

    reporter.sweep()
    await vi.waitFor(() => expect(reported).toHaveLength(3))

    expect(reported.at(-1)).not.toBe("ws_b")
    expect(reported[0]).toBe("ws_b")
    reporter.stop()
  })

  it("serves reportNow ahead of an already queued sweep", async () => {
    const gate = createDeferred()
    const usersByWorkspace = new Map(
      Array.from({ length: 5 }, (_, index) => [`ws_${index}`, ["u"]]),
    )
    const { reported, reporter } = createHarness({
      concurrency: 1,
      reportFor: (workspaceId) =>
        workspaceId === "ws_0" ? gate.promise : Promise.resolve(),
      usersByWorkspace,
    })

    reporter.sweep()
    await flushMicrotasks()
    reporter.reportNow("ws_4")
    gate.resolve()
    await vi.waitFor(() => expect(reported).toHaveLength(5))

    expect(reported[1]).toBe("ws_4")
    expect(
      reported.filter((workspaceId) => workspaceId === "ws_4"),
    ).toHaveLength(1)
    reporter.stop()
  })

  it("does not start a second report for a workspace already in flight, and re-runs a reportNow requested meanwhile", async () => {
    const gate = createDeferred()
    const usersByWorkspace = new Map([["ws_1", ["u_1"]]])
    const { report, reportedUserIds, reporter } = createHarness({
      concurrency: 4,
      reportFor: () => gate.promise,
      usersByWorkspace,
    })

    reporter.sweep()
    await flushMicrotasks()
    reporter.sweep()
    await flushMicrotasks()
    expect(report).toHaveBeenCalledTimes(1)

    usersByWorkspace.set("ws_1", ["u_1", "u_2"])
    reporter.reportNow("ws_1")
    gate.resolve()
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(2))

    expect(reportedUserIds.get("ws_1")).toEqual(["u_1", "u_2"])
    reporter.stop()
  })

  it("skips a workspace that has no connected users any more and prunes its bookkeeping", async () => {
    const usersByWorkspace = new Map<string, string[]>([["ws_gone", []]])
    const { report, reporter } = createHarness({
      concurrency: 2,
      usersByWorkspace,
    })

    reporter.reportNow("ws_gone")
    await flushMicrotasks()

    expect(report).not.toHaveBeenCalled()
    reporter.stop()
  })

  it("drains a large backlog of disconnected workspaces without recursing, keeping every slot usable", async () => {
    const gate = createDeferred()
    const backlogSize = 20_000
    const usersByWorkspace = new Map<string, string[]>(
      Array.from({ length: backlogSize }, (_, index) => [`ws_${index}`, ["u"]]),
    )
    const onError = vi.fn()
    const reported: string[] = []
    const reporter = createPresenceReporter({
      concurrency: 1,
      getConnectedWorkspaceIds: () => usersByWorkspace.keys(),
      getUserIds: (workspaceId) => usersByWorkspace.get(workspaceId) ?? [],
      onError,
      report: (workspaceId) => {
        reported.push(workspaceId)
        return (workspaceId === "ws_0" ? gate.promise : Promise.resolve()).then(
          () => true,
        )
      },
    })

    reporter.sweep()
    await flushMicrotasks()
    for (let index = 1; index < backlogSize; index += 1) {
      usersByWorkspace.delete(`ws_${index}`)
    }
    usersByWorkspace.set("ws_new", ["u"])
    gate.resolve()
    reporter.reportNow("ws_new")

    await vi.waitFor(() => expect(reported).toContain("ws_new"))
    expect(onError).not.toHaveBeenCalled()
    reporter.stop()
  })

  it("does not treat a rejected report as fresh: that workspace stays the stalest", async () => {
    const usersByWorkspace = new Map([
      ["ws_a", ["u"]],
      ["ws_b", ["u"]],
    ])
    let isAAccepted = true
    const { reported, reporter } = createHarness({
      concurrency: 1,
      isAccepted: (workspaceId) => workspaceId !== "ws_a" || isAAccepted,
      usersByWorkspace,
    })

    reporter.reportNow("ws_a")
    reporter.reportNow("ws_b")
    await vi.waitFor(() => expect(reported).toHaveLength(2))
    // b renews again, then a's renewal is rejected (e.g. a 5s builder
    // timeout, which reportWorkspacePresence swallows and reports as false).
    reporter.reportNow("ws_b")
    await vi.waitFor(() => expect(reported).toHaveLength(3))
    isAAccepted = false
    reporter.reportNow("ws_a")
    await vi.waitFor(() => expect(reported).toHaveLength(4))
    reported.length = 0

    reporter.sweep()
    await vi.waitFor(() => expect(reported).toHaveLength(2))

    // a last renewed before b did, so its lease expires first.
    expect(reported[0]).toBe("ws_a")
    reporter.stop()
  })

  it("re-sorts a backlog still queued when the next sweep starts, so a failed workspace is retried first", async () => {
    const gates = new Map<string, Deferred>()
    const usersByWorkspace = new Map(
      ["ws_a", "ws_b", "ws_c", "ws_d"].map((id) => [id, ["u"]]),
    )
    const { reported, reporter } = createHarness({
      concurrency: 1,
      isAccepted: (workspaceId) => workspaceId !== "ws_a",
      reportFor: (workspaceId) => {
        const gate = createDeferred()
        gates.set(workspaceId, gate)
        return gate.promise
      },
      usersByWorkspace,
    })

    reporter.sweep()
    await vi.waitFor(() => expect(reported).toEqual(["ws_a"]))
    // ws_a's renewal is rejected, so it stays the stalest; ws_b starts next.
    gates.get("ws_a")?.resolve()
    await vi.waitFor(() => expect(reported).toEqual(["ws_a", "ws_b"]))
    // ws_c and ws_d are still queued from the first sweep.
    reporter.sweep()
    gates.get("ws_b")?.resolve()
    await vi.waitFor(() => expect(reported).toHaveLength(3))

    expect(reported[2]).toBe("ws_a")
    reporter.stop()
  })

  it("keeps draining after a report rejects", async () => {
    const usersByWorkspace = new Map([
      ["ws_bad", ["u"]],
      ["ws_ok", ["u"]],
    ])
    const onError = vi.fn()
    const report = vi.fn((workspaceId: string) =>
      workspaceId === "ws_bad"
        ? Promise.reject(new Error("builder down"))
        : Promise.resolve(true),
    )
    const reporter = createPresenceReporter({
      concurrency: 1,
      getConnectedWorkspaceIds: () => usersByWorkspace.keys(),
      getUserIds: (workspaceId) => usersByWorkspace.get(workspaceId) ?? [],
      onError,
      report,
    })

    reporter.sweep()
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(2))

    expect(onError).toHaveBeenCalledTimes(1)
    reporter.stop()
  })

  it("stops starting new reports after stop()", async () => {
    const usersByWorkspace = new Map([["ws_1", ["u"]]])
    const { report, reporter } = createHarness({
      concurrency: 1,
      usersByWorkspace,
    })

    reporter.stop()
    reporter.sweep()
    reporter.reportNow("ws_1")
    await flushMicrotasks()

    expect(report).not.toHaveBeenCalled()
  })
})
