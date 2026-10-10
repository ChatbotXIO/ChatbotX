import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const returning = vi.fn()
  const values = vi.fn(() => ({ returning }))
  const insert = vi.fn(() => ({ values }))
  return { insert, values, returning }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { insert: mocks.insert },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  invitationModel: { _: "Invitation" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "invitation-1",
  SymbolicSnowflakeIDs: { generate: () => "invite-code" },
}))

const { invitationService } = await import("../src/invitation/service")

describe("invitationService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-08T00:00:00.000Z"))
    mocks.returning.mockResolvedValue([{ id: "invitation-1" }])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("inserts a one-day invite code and returns the row", async () => {
    const permissions = { superAdmin: true } as never

    const invitation = await invitationService.create({
      workspaceId: "ws-1",
      invitedBy: "user-1",
      permissions,
    })

    expect(invitation).toEqual({ id: "invitation-1" })
    expect(mocks.values).toHaveBeenCalledWith({
      id: "invitation-1",
      code: "invite-code",
      permissions,
      expiresAt: new Date("2026-10-09T00:00:00.000Z"),
      workspaceId: "ws-1",
      invitedBy: "user-1",
    })
  })
})
