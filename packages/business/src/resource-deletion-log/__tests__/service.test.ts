import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { SYSTEM_ACTOR } from "../../audit/actor"
import { withAuditContext } from "../../audit/context"

const mocks = vi.hoisted(() => ({
  insert: vi.fn(async () => undefined),
  findPendingIdByResource: vi.fn(),
  completePendingById: vi.fn(),
  cancelPendingByResource: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  resourceDeletionLogRepository: {
    insert: mocks.insert,
    findPendingIdByResource: mocks.findPendingIdByResource,
    completePendingById: mocks.completePendingById,
    cancelPendingByResource: mocks.cancelPendingByResource,
  },
}))

vi.mock("../../logger", () => ({ logger: { warn: mocks.loggerWarn } }))

const { resourceDeletionLogService } = await import("../service")

const tx = { marker: "tx" } as never

const channel = {
  type: "channel",
  id: "inbox-1",
  workspaceId: "ws-1",
  subtype: "whatsapp",
  name: "Support line",
} as const

const insertedRow = () => {
  const [row, client] = mocks.insert.mock.calls[0] as unknown as [
    Record<string, unknown>,
    unknown,
  ]
  return { row, client }
}

beforeEach(() => {
  mocks.insert.mockClear()
  mocks.findPendingIdByResource.mockReset()
  mocks.completePendingById.mockReset()
  mocks.cancelPendingByResource.mockReset()
  mocks.loggerWarn.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("resourceDeletionLogService.recordRequest", () => {
  test("takes the user, IP, user agent and source from the audit context", async () => {
    await withAuditContext(
      {
        userId: "user-1",
        workspaceId: "ws-1",
        ipAddress: "203.0.113.7",
        userAgent: "Mozilla/5.0",
        source: "api-token:42",
      },
      () =>
        resourceDeletionLogService.recordRequest({
          resource: channel,
          status: "completed",
          tx,
        }),
    )

    const { row, client } = insertedRow()
    expect(client).toBe(tx)
    expect(row).toMatchObject({
      workspaceId: "ws-1",
      resourceType: "channel",
      resourceId: "inbox-1",
      resourceSubtype: "whatsapp",
      resourceName: "Support line",
      status: "completed",
      requestedByUserId: "user-1",
      requestSource: "api-token:42",
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      canceledAt: null,
    })
    expect(row.completedAt).toBeInstanceOf(Date)
    expect(row.requestedAt).toBeInstanceOf(Date)
  })

  test("caps header-derived IP and user agent so an oversized header is not retained", async () => {
    await withAuditContext(
      {
        userId: "user-1",
        ipAddress: "9".repeat(200),
        userAgent: "A".repeat(5000),
      },
      () =>
        resourceDeletionLogService.recordRequest({
          resource: channel,
          status: "completed",
          tx,
        }),
    )

    const { row } = insertedRow()
    expect(row.ipAddress).toBe("9".repeat(64))
    expect(row.userAgent).toBe("A".repeat(1024))
  })

  test("keeps a normal IP and user agent intact", async () => {
    await withAuditContext(
      { userId: "user-1", ipAddress: "2001:db8::1", userAgent: "Mozilla/5.0" },
      () =>
        resourceDeletionLogService.recordRequest({
          resource: channel,
          status: "completed",
          tx,
        }),
    )

    expect(insertedRow().row).toMatchObject({
      ipAddress: "2001:db8::1",
      userAgent: "Mozilla/5.0",
    })
  })

  test("prefers an explicit requester over the ambient actor but keeps the actor's origin", async () => {
    await withAuditContext(
      { userId: "owner-1", ipAddress: "203.0.113.7", userAgent: "UA" },
      () =>
        resourceDeletionLogService.recordRequest({
          resource: { type: "workspace", id: "ws-1", workspaceId: "ws-1" },
          status: "pending",
          requestedByUserId: "user-9",
          tx,
        }),
    )

    expect(insertedRow().row).toMatchObject({
      requestedByUserId: "user-9",
      ipAddress: "203.0.113.7",
      userAgent: "UA",
      status: "pending",
      completedAt: null,
      canceledAt: null,
    })
  })

  test("stores a system actor as no user and keeps its source", async () => {
    await withAuditContext(
      { userId: SYSTEM_ACTOR, source: "template:uninstallTemplate" },
      () =>
        resourceDeletionLogService.recordRequest({
          resource: channel,
          status: "completed",
          tx,
        }),
    )

    expect(insertedRow().row).toMatchObject({
      requestedByUserId: null,
      requestSource: "template:uninstallTemplate",
      ipAddress: null,
      userAgent: null,
    })
  })

  test("stores nulls when there is no audit context", async () => {
    await resourceDeletionLogService.recordRequest({
      resource: { type: "workspace", id: "ws-1", workspaceId: "ws-1" },
      status: "pending",
      tx,
    })

    expect(insertedRow().row).toMatchObject({
      requestedByUserId: null,
      requestSource: null,
      ipAddress: null,
      userAgent: null,
      resourceSubtype: null,
      resourceName: null,
    })
  })

  test("stamps canceledAt, not completedAt, on a canceled row", async () => {
    await resourceDeletionLogService.recordRequest({
      resource: channel,
      status: "canceled",
      tx,
    })

    const { row } = insertedRow()
    expect(row.canceledAt).toBeInstanceOf(Date)
    expect(row.completedAt).toBeNull()
  })

  test("lets a failing insert reach the caller so its transaction rolls back", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("insert failed"))

    await expect(
      resourceDeletionLogService.recordRequest({
        resource: channel,
        status: "completed",
        tx,
      }),
    ).rejects.toThrow("insert failed")
  })
})

describe("resourceDeletionLogService.recordHistoricalRequest", () => {
  test("never copies the ambient actor's origin onto an earlier request", async () => {
    const requestedAt = new Date("2026-10-01T00:00:00.000Z")

    await withAuditContext(
      {
        userId: "admin-2",
        ipAddress: "198.51.100.9",
        userAgent: "Cancel-Browser",
        source: "api-token:7",
      },
      () =>
        resourceDeletionLogService.recordHistoricalRequest({
          resource: { type: "workspace", id: "ws-1", workspaceId: "ws-1" },
          status: "canceled",
          requestedByUserId: "user-1",
          requestedAt,
          tx,
        }),
    )

    const { row } = insertedRow()
    expect(row).toMatchObject({
      requestedByUserId: "user-1",
      requestSource: null,
      ipAddress: null,
      userAgent: null,
      requestedAt,
      status: "canceled",
    })
    expect(row.canceledAt).toBeInstanceOf(Date)
  })

  test("keeps an unknown requester as null", async () => {
    await resourceDeletionLogService.recordHistoricalRequest({
      resource: { type: "workspace", id: "ws-1", workspaceId: "ws-1" },
      status: "completed",
      requestedByUserId: null,
      requestedAt: new Date(0),
      tx,
    })

    const { row } = insertedRow()
    expect(row.requestedByUserId).toBeNull()
    expect(row.completedAt).toBeInstanceOf(Date)
  })
})

describe("resourceDeletionLogService lookups and transitions", () => {
  test("findPendingId looks the resource up by workspace, type and id", async () => {
    mocks.findPendingIdByResource.mockResolvedValue("log-9")

    await expect(
      resourceDeletionLogService.findPendingId({ resource: channel }),
    ).resolves.toBe("log-9")

    expect(mocks.findPendingIdByResource).toHaveBeenCalledWith(
      { workspaceId: "ws-1", resourceType: "channel", resourceId: "inbox-1" },
      undefined,
    )
  })

  test("completePending completes by id and reports the rows updated", async () => {
    mocks.completePendingById.mockResolvedValue(0)

    await expect(
      resourceDeletionLogService.completePending({ id: "log-9", tx }),
    ).resolves.toBe(0)

    expect(mocks.completePendingById).toHaveBeenCalledWith(
      { id: "log-9", completedAt: expect.any(Date) },
      tx,
    )
  })

  test("cancelPending cancels the resource's pending requests in its workspace", async () => {
    mocks.cancelPendingByResource.mockResolvedValue(2)

    await expect(
      resourceDeletionLogService.cancelPending({ resource: channel, tx }),
    ).resolves.toBe(2)

    expect(mocks.cancelPendingByResource).toHaveBeenCalledWith(
      {
        workspaceId: "ws-1",
        resourceType: "channel",
        resourceId: "inbox-1",
        canceledAt: expect.any(Date),
      },
      tx,
    )
  })

  test("warns when an unindexed scan is slow, and not when it is fast", async () => {
    mocks.findPendingIdByResource.mockResolvedValue(undefined)
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(600)

    await resourceDeletionLogService.findPendingId({ resource: channel })

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { durationMs: 600, operation: "findPendingId" },
      "resource-deletion-log: slow unindexed scan",
    )

    mocks.loggerWarn.mockClear()
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(10)
    await resourceDeletionLogService.findPendingId({ resource: channel })
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })

  test("still measures a scan that throws", async () => {
    mocks.cancelPendingByResource.mockRejectedValue(new Error("db down"))
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(900)

    await expect(
      resourceDeletionLogService.cancelPending({ resource: channel, tx }),
    ).rejects.toThrow("db down")

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { durationMs: 900, operation: "cancelPending" },
      "resource-deletion-log: slow unindexed scan",
    )
  })
})
