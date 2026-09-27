import { beforeEach, describe, expect, test, vi } from "vitest"

const returningMock = vi.fn()
const whereMock = vi.fn(() => ({ returning: returningMock }))
const setMock = vi.fn(() => ({ where: whereMock }))
const updateMock = vi.fn(() => ({ set: setMock }))

const andMock = vi.fn((...conditions: unknown[]) => ({ op: "and", conditions }))
const eqMock = vi.fn((field: unknown, value: unknown) => ({
  op: "eq",
  field,
  value,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...conditions: unknown[]) => andMock(...conditions),
  db: {
    update: (...args: unknown[]) => updateMock(...(args as [])),
  },
  eq: (field: unknown, value: unknown) => eqMock(field, value),
}))

const { inboxService } = await import("../src/inbox/service")

describe("inboxService.updateMarkReadOnOutbound", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    returningMock.mockResolvedValue([])
  })

  test("updates the workspace-scoped inbox and returns it", async () => {
    const inbox = {
      id: "inbox-1",
      workspaceId: "ws-1",
      name: "Support",
      channel: "messenger",
      sourceId: "page-1",
      status: "connected",
      markReadOnOutbound: true,
      disconnectedAt: null,
      disconnectReason: null,
      createdAt: new Date("2026-09-23T00:00:00.000Z"),
      updatedAt: new Date("2026-09-23T00:00:00.000Z"),
    }
    returningMock.mockResolvedValueOnce([inbox])

    await expect(
      inboxService.updateMarkReadOnOutbound({
        workspaceId: "ws-1",
        id: "inbox-1",
        enabled: true,
      }),
    ).resolves.toBe(inbox)

    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(setMock).toHaveBeenCalledWith({ markReadOnOutbound: true })
    expect(eqMock.mock.calls.map((call) => call[1])).toEqual([
      "inbox-1",
      "ws-1",
    ])
    expect(returningMock).toHaveBeenCalledTimes(1)
  })

  test("throws not found when no workspace-scoped inbox is updated", async () => {
    await expect(
      inboxService.updateMarkReadOnOutbound({
        workspaceId: "ws-1",
        id: "foreign-inbox",
        enabled: false,
      }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })
  })
})
