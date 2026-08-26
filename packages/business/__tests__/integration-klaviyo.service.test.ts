import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateReturning: vi.fn(),
  txInsertValues: vi.fn(),
  txDeleteWhere: vi.fn(),
  transaction: vi.fn(),
  encryptObject: vi.fn(),
}))

const updateChain = {
  set: vi.fn(() => ({
    where: vi.fn(() => ({ returning: mocks.updateReturning })),
  })),
}

vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationKlaviyoModel: { findFirst: mocks.findFirst },
    },
    update: vi.fn(() => updateChain),
    transaction: mocks.transaction,
  },
  eq: vi.fn(),
  isDatabaseError: vi.fn().mockReturnValue(false),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationKlaviyoModel: { id: "id", workspaceId: "workspaceId" },
  integrationModel: { id: "id" },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { encryptObject: mocks.encryptObject },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { integrationKlaviyoService } = await import(
  "../src/integration-klaviyo/service"
)

describe("IntegrationKlaviyoService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.encryptObject.mockResolvedValue({ encrypted: true })
  })

  test("encrypts and updates an existing workspace integration", async () => {
    mocks.updateReturning.mockResolvedValue([{ id: "klaviyo-1" }])

    await expect(
      integrationKlaviyoService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).resolves.toBe("klaviyo-1")

    expect(mocks.encryptObject).toHaveBeenCalledWith({
      authType: "custom",
      apiKey: "secret",
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("creates parent and encrypted child atomically when absent", async () => {
    mocks.updateReturning.mockResolvedValue([])
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ insert: vi.fn(() => ({ values: mocks.txInsertValues })) }),
    )

    await expect(
      integrationKlaviyoService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).resolves.toBeTypeOf("string")

    expect(mocks.txInsertValues).toHaveBeenCalledTimes(2)
    expect(mocks.txInsertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        auth: { encrypted: true },
      }),
    )
  })

  test("recovers only after the workspace unique constraint wins", async () => {
    const uniqueError = Object.assign(new Error("unique violation"), {
      cause: {
        code: "23505",
        constraint: "IntegrationKlaviyo_workspaceId_key",
      },
    })
    const { isDatabaseError } = await import("@chatbotx.io/database/client")
    vi.mocked(isDatabaseError).mockImplementation(
      (error: unknown) => error === uniqueError,
    )
    mocks.updateReturning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "winner-id" }])
    mocks.transaction.mockRejectedValue(uniqueError)

    await expect(
      integrationKlaviyoService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).resolves.toBe("winner-id")

    const wrongConstraint = Object.assign(new Error("wrong constraint"), {
      cause: { code: "23505", constraint: "another_key" },
    })
    vi.mocked(isDatabaseError).mockImplementation(
      (error: unknown) => error === wrongConstraint,
    )
    mocks.updateReturning.mockResolvedValueOnce([])
    mocks.transaction.mockRejectedValueOnce(wrongConstraint)
    await expect(
      integrationKlaviyoService.upsert({
        workspaceId: "workspace-1",
        auth: { authType: "custom", apiKey: "secret" },
      }),
    ).rejects.toBe(wrongConstraint)
  })

  test("disconnects child and parent atomically and is a no-op when missing", async () => {
    mocks.findFirst.mockResolvedValueOnce(undefined)
    await integrationKlaviyoService.disconnect("workspace-1")
    expect(mocks.transaction).not.toHaveBeenCalled()

    mocks.findFirst.mockResolvedValueOnce({
      id: "klaviyo-1",
      integrationId: "integration-1",
    })
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        delete: vi.fn(() => ({
          where: mocks.txDeleteWhere,
        })),
      }),
    )
    await integrationKlaviyoService.disconnect("workspace-1")
    expect(mocks.txDeleteWhere).toHaveBeenCalledTimes(2)
  })
})
