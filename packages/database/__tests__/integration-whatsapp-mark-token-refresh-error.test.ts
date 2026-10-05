import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {},
  eq: mocks.eq,
  inArray: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("../src/partials", () => ({
  inboxStatuses: { enum: { connected: "connected" } },
}))

vi.mock("../src/schema", () => ({
  inboxModel: { id: "inboxId", status: "inboxStatus" },
  integrationWhatsappModel: {
    id: "integrationId",
    workspaceId: "integrationWorkspaceId",
    phoneNumberId: "phoneNumberId",
    tokenRefreshError: "tokenRefreshError",
  },
}))

// Dynamic: `vi.mock` calls above are hoisted above any static import of the
// SUT, so importing it must happen after those mocks are registered.
const { integrationWhatsappRepository } = await import(
  "../src/repositories/integration-whatsapp/repository"
)

function buildUpdateTx(returningResult: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returningResult)
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return { update, set, where, returning }
}

describe("integrationWhatsappRepository.markTokenRefreshError", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("scopes the update by both id and workspaceId and returns the row's phoneNumberId", async () => {
    const tx = buildUpdateTx([{ phoneNumberId: "phone-1" }])

    await expect(
      integrationWhatsappRepository.markTokenRefreshError(
        { id: "integration-1", workspaceId: "ws-1", error: "boom" },
        tx as never,
      ),
    ).resolves.toEqual({ phoneNumberId: "phone-1" })

    expect(tx.set).toHaveBeenCalledWith({ tokenRefreshError: "boom" })
    expect(mocks.eq).toHaveBeenCalledWith("integrationId", "integration-1")
    expect(mocks.eq).toHaveBeenCalledWith("integrationWorkspaceId", "ws-1")
    expect(mocks.and).toHaveBeenCalledWith(
      { eq: ["integrationId", "integration-1"] },
      { eq: ["integrationWorkspaceId", "ws-1"] },
    )
  })

  test("returns undefined when no row matches the (id, workspaceId) pair — a forged integration id from another tenant", async () => {
    const tx = buildUpdateTx([])

    await expect(
      integrationWhatsappRepository.markTokenRefreshError(
        { id: "integration-1", workspaceId: "ws-foreign", error: "boom" },
        tx as never,
      ),
    ).resolves.toBeUndefined()
  })
})
