import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateReturning: vi.fn(),
  txInsertValues: vi.fn(),
  transaction: vi.fn(),
  encryptObject: vi.fn(),
}))

const updateChain = {
  set: vi.fn(() => ({
    where: vi.fn(() => ({ returning: mocks.updateReturning })),
  })),
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationMailerLiteModel: { findFirst: vi.fn() },
    },
    update: vi.fn(() => updateChain),
    transaction: mocks.transaction,
    delete: vi.fn(),
  },
  eq: vi.fn(),
  isDatabaseError: vi.fn().mockReturnValue(false),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationMailerLiteModel: { id: "id", workspaceId: "workspaceId" },
  integrationModel: { id: "id" },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { encryptObject: mocks.encryptObject },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { integrationMailerLiteService } = await import(
  "../src/integration-mailer-lite/service"
)

describe("IntegrationMailerLiteService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.encryptObject.mockResolvedValue({ encrypted: true })
  })

  test("encrypts and updates an existing workspace integration", async () => {
    mocks.updateReturning.mockResolvedValue([{ id: "mailer-lite-1" }])

    await expect(
      integrationMailerLiteService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).resolves.toBe("mailer-lite-1")

    expect(mocks.encryptObject).toHaveBeenCalledWith({
      authType: "custom",
      apiKey: "secret",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("creates parent and encrypted child atomically when absent", async () => {
    mocks.updateReturning.mockResolvedValue([])
    mocks.txInsertValues.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ insert: vi.fn(() => ({ values: mocks.txInsertValues })) }),
    )

    await expect(
      integrationMailerLiteService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).resolves.toBeTypeOf("string")

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.txInsertValues).toHaveBeenCalledTimes(2)
    expect(mocks.txInsertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        auth: { encrypted: true },
      }),
    )
  })

  test("recovers after a concurrent unique insert wins", async () => {
    const uniqueError = Object.assign(new Error("unique violation"), {
      cause: {
        code: "23505",
        constraint: "IntegrationMailerLite_workspaceId_key",
      },
    })
    const { isDatabaseError } = await import("@chatbotx.io/database/client")
    vi.mocked(isDatabaseError).mockImplementationOnce(
      (e: unknown) => e === uniqueError,
    )

    mocks.updateReturning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "winner-id" }])
    mocks.transaction.mockRejectedValue(uniqueError)

    await expect(
      integrationMailerLiteService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).resolves.toBe("winner-id")
  })

  test("fails when create rolls back and no concurrent row exists", async () => {
    mocks.updateReturning.mockResolvedValue([])
    // Non-unique-violation errors are rethrown as-is so callers keep the
    // original failure context instead of a generic wrapper message.
    mocks.transaction.mockRejectedValue(new Error("insert failed"))

    await expect(
      integrationMailerLiteService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).rejects.toThrow("insert failed")
  })
})
