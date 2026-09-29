import { beforeEach, describe, expect, test, vi } from "vitest"

// hasAnyChannel must NOT filter on Inbox.status (a disconnected WhatsApp
// number still has call history to show) and must short-circuit an empty
// channel list instead of emitting `IN ()`.

const limitMock = vi.fn()
const whereMock = vi.fn(() => ({ limit: limitMock }))
const fromMock = vi.fn(() => ({ where: whereMock }))
const selectMock = vi.fn(() => ({ from: fromMock }))

const andMock = vi.fn((...conditions: unknown[]) => ({ op: "and", conditions }))
const eqMock = vi.fn((field: unknown, value: unknown) => ({
  op: "eq",
  field,
  value,
}))
const inArrayMock = vi.fn((field: unknown, values: unknown[]) => ({
  op: "inArray",
  field,
  values,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...conditions: unknown[]) => andMock(...conditions),
  db: {
    select: (...args: unknown[]) => selectMock(...(args as [])),
    query: { inboxModel: { findFirst: vi.fn() } },
  },
  eq: (field: unknown, value: unknown) => eqMock(field, value),
  inArray: (field: unknown, values: unknown[]) => inArrayMock(field, values),
  ne: vi.fn(),
  relationsFilterToSQL: vi.fn(),
}))

const { inboxService } = await import("../src/inbox/service")

describe("inboxService.hasAnyChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    limitMock.mockResolvedValue([])
  })

  test("returns true when the workspace has an inbox on one of the channels", async () => {
    limitMock.mockResolvedValue([{ id: "inbox-1" }])

    await expect(
      inboxService.hasAnyChannel({
        workspaceId: "ws-1",
        channels: ["whatsapp"],
      }),
    ).resolves.toBe(true)
  })

  test("returns false when the workspace has none", async () => {
    await expect(
      inboxService.hasAnyChannel({
        workspaceId: "ws-1",
        channels: ["whatsapp"],
      }),
    ).resolves.toBe(false)
  })

  test("short-circuits an empty channel list without querying", async () => {
    await expect(
      inboxService.hasAnyChannel({ workspaceId: "ws-1", channels: [] }),
    ).resolves.toBe(false)
    expect(selectMock).not.toHaveBeenCalled()
  })

  test("scopes by workspace and channel only — never by status, so a disconnected channel still counts", async () => {
    await inboxService.hasAnyChannel({
      workspaceId: "ws-1",
      channels: ["whatsapp", "messenger"],
    })

    expect(eqMock).toHaveBeenCalledTimes(1)
    expect(eqMock.mock.calls[0]?.[1]).toBe("ws-1")
    expect(inArrayMock).toHaveBeenCalledTimes(1)
    expect(inArrayMock.mock.calls[0]?.[1]).toEqual(["whatsapp", "messenger"])
  })

  test("bounds the probe to a single row", async () => {
    await inboxService.hasAnyChannel({
      workspaceId: "ws-1",
      channels: ["whatsapp"],
    })

    expect(limitMock).toHaveBeenCalledWith(1)
  })

  test("passes the channel list by value — a caller's array is never mutated", async () => {
    const channels = ["whatsapp"] as const
    await inboxService.hasAnyChannel({ workspaceId: "ws-1", channels })

    expect(inArrayMock.mock.calls[0]?.[1]).not.toBe(channels)
    expect(channels).toEqual(["whatsapp"])
  })
})
