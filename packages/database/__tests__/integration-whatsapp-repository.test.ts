import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  arrayContains: vi.fn(),
  db: {},
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  gt: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  not: vi.fn(),
  or: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: [Array.from(strings), values],
  })),
}))

vi.mock("../src/schema", () => ({
  integrationWhatsappModel: {
    id: "integrationId",
    workspaceId: "integrationWorkspaceId",
    inboxId: "inboxId",
    phoneNumberId: "phoneNumberId",
    auth: "auth",
    coexistEnabled: "coexistEnabled",
    coexistAiReadsSyncedHistory: "coexistAiReadsSyncedHistory",
  },
  whatsappSignupSessionModel: {
    id: "id",
  },
}))

const { integrationWhatsappRepository } = await import(
  "../src/repositories/integration-whatsapp/repository"
)

describe("integrationWhatsappRepository.upsertByInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseInput = {
    id: "integration-1",
    workspaceId: "workspace-1",
    inboxId: "inbox-1",
    auth: { tokens: { accessToken: "token" } },
    phoneNumberId: "pn-1",
    wabaId: "waba-1",
    businessId: "business-1",
    name: "Acme",
    displayPhoneNumber: "+1 555",
    isCoexist: false,
    platformType: "",
  }

  test("inserts a new row on the happy path", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "integration-1" }])
    const onConflictDoUpdate = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    const insert = vi.fn(() => ({ values }))
    const tx = { insert } as never

    await expect(
      integrationWhatsappRepository.upsertByInbox(baseInput, tx),
    ).resolves.toEqual({ id: "integration-1" })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "integration-1",
        inboxId: "inbox-1",
        phoneNumberId: "pn-1",
        registrationStatus: "pending_verification",
      }),
    )
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ["inboxId"],
        set: expect.objectContaining({
          name: "Acme",
          displayPhoneNumber: "+1 555",
        }),
      }),
    )
  })

  test("re-writes the same row on a retry that conflicts on inboxId", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: "integration-1", name: "Acme" }])
    const onConflictDoUpdate = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    const insert = vi.fn(() => ({ values }))
    const tx = { insert } as never

    await expect(
      integrationWhatsappRepository.upsertByInbox(baseInput, tx),
    ).resolves.toEqual({ id: "integration-1", name: "Acme" })
  })
})
