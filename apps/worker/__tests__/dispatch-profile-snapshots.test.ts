import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  enqueue: vi.fn(),
  exhausted: vi.fn(),
  due: vi.fn(),
  guard: vi.fn(),
  storeDelete: vi.fn(),
  storeGet: vi.fn(),
  storePut: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    completeProfileSnapshot: mocks.complete,
    listDueProfileSnapshots: mocks.due,
    listExhaustedProfileSnapshots: mocks.exhausted,
  },
  serializeProfileSnapshotCursor: (r: {
    contactInboxId: string
    nextAttemptAt: Date | null
  }) =>
    r.nextAttemptAt
      ? `${r.nextAttemptAt.toISOString()}|${r.contactInboxId}`
      : undefined,
  withBlockedOwnerGuard: mocks.guard,
}))

vi.mock("../src/integration/handlers/profile-snapshot/queue", () => ({
  enqueueProfileSnapshotJobs: mocks.enqueue,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.error, warn: mocks.warn },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    delete: mocks.storeDelete,
    get: mocks.storeGet,
    put: mocks.storePut,
  },
}))

const { dispatchProfileSnapshots } = await import(
  "../src/schedule/handlers/dispatch-profile-snapshots"
)

// All fixtures share one nextAttemptAt so the composite keyset cursor
// (`${isoNextAttemptAt}|${contactInboxId}`) is deterministic in assertions.
const AT = new Date("2026-01-01T00:00:00.000Z")
const CURSOR_AT = AT.toISOString()

const row = (contactInboxId: string, workspaceId = "workspace-1") => ({
  contactInboxId,
  inboxId: "inbox-1",
  nextAttemptAt: AT,
  workspaceId,
})

describe("dispatchProfileSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.complete.mockResolvedValue(true)
    mocks.enqueue.mockResolvedValue(undefined)
    mocks.guard.mockImplementation(async (_workspaceId, fn) => await fn())
    mocks.exhausted.mockResolvedValue([])
    mocks.due.mockResolvedValue([])
    mocks.storeDelete.mockResolvedValue(undefined)
    mocks.storeGet.mockResolvedValue(null)
    mocks.storePut.mockResolvedValue(undefined)
  })

  test("uses an expired-lease CAS while terminalizing exhausted work", async () => {
    mocks.exhausted.mockResolvedValueOnce([{ ...row("ci-1"), attempt: 5 }])

    await dispatchProfileSnapshots()

    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 5,
        onlyIfLeaseExpired: true,
        outcome: "failed",
      }),
    )
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 5, reason: "retryExhausted" }),
      expect.any(String),
    )
  })

  test("continues past a blocked workspace and dispatches later eligible rows", async () => {
    mocks.due.mockResolvedValueOnce([
      row("ci-blocked", "workspace-blocked"),
      row("ci-ready", "workspace-ready"),
    ])
    mocks.guard.mockImplementation(async (workspaceId, fn) =>
      workspaceId === "workspace-blocked" ? undefined : await fn(),
    )

    await dispatchProfileSnapshots()

    expect(mocks.enqueue).toHaveBeenCalledWith({
      contactInboxIds: ["ci-ready"],
      inboxId: "inbox-1",
      workspaceId: "workspace-ready",
    })
    expect(mocks.enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-blocked" }),
    )
  })

  test("paginates exhausted and due rows independently", async () => {
    mocks.exhausted
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => ({
          ...row(`exhausted-${index}`),
          attempt: 5,
        })),
      )
      .mockResolvedValueOnce([])
    mocks.due
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) => row(`due-${index}`)),
      )
      .mockResolvedValueOnce([])

    await dispatchProfileSnapshots()

    expect(mocks.exhausted).toHaveBeenNthCalledWith(2, {
      cursor: `${CURSOR_AT}|exhausted-99`,
      limit: 100,
    })
    expect(mocks.due).toHaveBeenNthCalledWith(2, {
      cursor: `${CURSOR_AT}|due-99`,
      limit: 100,
    })
  })

  test("persists its cursor past a blocked prefix larger than one run budget", async () => {
    const cursors = new Map<string, string>()
    mocks.storeGet.mockImplementation((key: string) =>
      Promise.resolve(cursors.get(key)),
    )
    mocks.storePut.mockImplementation((key: string, cursor: string) => {
      cursors.set(key, cursor)
      return Promise.resolve(undefined)
    })
    mocks.storeDelete.mockImplementation((key: string) => {
      cursors.delete(key)
      return Promise.resolve(undefined)
    })
    mocks.guard.mockImplementation(async (workspaceId, fn) =>
      workspaceId === "workspace-blocked" ? undefined : await fn(),
    )
    mocks.due.mockImplementation(({ cursor }: { cursor?: string }) => {
      // Composite cursor is `${iso}|${contactInboxId}`; the id is the last row.
      const lastId = cursor ? cursor.split("|")[1] : undefined
      if (lastId === "blocked-1999") {
        return Promise.resolve([row("ci-ready", "workspace-ready")])
      }
      const page = lastId
        ? Math.floor(Number(lastId.slice("blocked-".length)) / 100) + 1
        : 0
      return Promise.resolve(
        Array.from({ length: 100 }, (_, index) =>
          row(`blocked-${page * 100 + index}`, "workspace-blocked"),
        ),
      )
    })

    await dispatchProfileSnapshots()

    expect(cursors.get("schedule:profile-snapshots:due-cursor")).toBe(
      `${CURSOR_AT}|blocked-1999`,
    )

    await dispatchProfileSnapshots()

    expect(mocks.enqueue).toHaveBeenCalledWith({
      contactInboxIds: ["ci-ready"],
      inboxId: "inbox-1",
      workspaceId: "workspace-ready",
    })
  })
})
