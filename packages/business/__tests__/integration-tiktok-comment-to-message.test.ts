// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn(async () => [{ openId: "open-1" }])
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  return {
    findOrFail: vi.fn(),
    update: vi.fn(() => ({ set: updateSet })),
    updateSet,
    updateReturning,
    connectionFindByProviderSourceId: vi.fn(async () => undefined),
    updateTiktokDirectReplyStatus: vi.fn(),
    getTiktokDirectReplyStatus: vi.fn(),
    auditRecord: vi.fn(),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: mocks.update },
  and: vi.fn(),
  eq: vi.fn(),
  findOrFail: mocks.findOrFail,
  inArray: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { findByProviderSourceId: vi.fn() },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationTiktokModel: { id: "id" },
}))

vi.mock("@chatbotx.io/integration-tiktok", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/integration-tiktok")>()),
  updateTiktokDirectReplyStatus: mocks.updateTiktokDirectReplyStatus,
  getTiktokDirectReplyStatus: mocks.getTiktokDirectReplyStatus,
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.auditRecord,
}))

vi.mock("../src/connection", () => ({
  CONNECTION_STORE_BINDINGS: { tiktok: { duplicateConstraint: undefined } },
  upsertConnectionRow: vi.fn(),
  withQuotaCompensation: vi.fn(
    async (_input: unknown, operation: () => Promise<unknown>) =>
      await operation(),
  ),
}))

vi.mock("../src/inbox/service", () => ({ inboxService: {} }))

// Pulled in by `connect`/`disconnect` (connection state tracking);
// `findByProviderSourceId` is also what `updateAuth` uses to decide whether
// to report a recovered connection — defaults to "no Connection row" so
// that check no-ops here, same as the other engine methods this stub never
// exercises.
vi.mock("../src/connection/state-service", () => ({
  connectionStateService: {
    findByProviderSourceId: mocks.connectionFindByProviderSourceId,
  },
}))

const { tiktokIntegrationService } = await import(
  "../src/integration-tiktok/service"
)

const auth = {
  tokens: { accessToken: "token-1" },
  metadata: { openId: "open-1", scopes: ["video.list"] },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findOrFail.mockResolvedValue({ id: "tt-1", auth })
})

describe("tiktokIntegrationService.setCommentToMessage", () => {
  test("flips the setting on TikTok, caches it and audits", async () => {
    await expect(
      tiktokIntegrationService.setCommentToMessage({
        workspaceId: "ws-1",
        id: "tt-1",
        enabled: true,
      }),
    ).resolves.toBe("ENABLE")

    expect(mocks.findOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tt-1", workspaceId: "ws-1" } }),
    )
    expect(mocks.updateTiktokDirectReplyStatus).toHaveBeenCalledWith(
      "token-1",
      "open-1",
      "ENABLE",
    )
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          metadata: expect.objectContaining({
            scopes: ["video.list"],
            commentToMessage: expect.objectContaining({ status: "ENABLE" }),
          }),
        }),
      }),
    )
    expect(mocks.auditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: "enabled TikTok Comment-to-Message",
    })
  })

  test("surfaces TikTok's rejection text and caches nothing", async () => {
    mocks.updateTiktokDirectReplyStatus.mockRejectedValueOnce(
      new Error("Account is not eligible"),
    )

    await expect(
      tiktokIntegrationService.setCommentToMessage({
        workspaceId: "ws-1",
        id: "tt-1",
        enabled: true,
      }),
    ).rejects.toThrow("Account is not eligible")
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })
})

describe("tiktokIntegrationService.refreshCommentToMessage", () => {
  test("leaves the cache alone when TikTok returns no status", async () => {
    mocks.getTiktokDirectReplyStatus.mockResolvedValueOnce(undefined)

    await expect(
      tiktokIntegrationService.refreshCommentToMessage({
        workspaceId: "ws-1",
        id: "tt-1",
      }),
    ).resolves.toBeNull()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
