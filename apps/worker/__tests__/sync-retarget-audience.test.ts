import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listRetargetContacts: vi.fn(),
  buildContext: vi.fn(async ({ integration }: { integration: unknown }) => ({
    auth: { accessToken: "token-1", version: "v23.0" },
    integration,
  })),
  findByWorkspaceIdOrFail: vi.fn(),
  markInvalid: vi.fn(),
  findWorkspace: vi.fn(),
  withBlockedOwnerGuard: vi.fn(
    async (_workspaceId: string | undefined, fn: () => Promise<void>) =>
      await fn(),
  ),
  decryptObject: vi.fn(),
  runAction: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    listRetargetContacts: mocks.listRetargetContacts,
  },
  buildContext: mocks.buildContext,
  integrationFacebookAdsService: {
    findByWorkspaceIdOrFail: mocks.findByWorkspaceIdOrFail,
    markInvalid: mocks.markInvalid,
  },
  workspaceService: {
    findById: mocks.findWorkspace,
  },
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: {
    decryptObject: mocks.decryptObject,
  },
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  GRAPH_ERROR_CODE_INVALID_TOKEN: 190,
  facebookAdsAuthSchema: {},
  getGraphErrorCode: (error: unknown) =>
    error instanceof Error && "code" in error && typeof error.code === "number"
      ? error.code
      : undefined,
  integration: { runAction: mocks.runAction },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

const { handleSyncRetargetAudience } = await import(
  "../src/integration/handlers/ads-conversion/sync-retarget-audience"
)

const jobData = {
  workspaceId: "ws-1",
  customAudienceId: "aud-1",
  segment: "conversations" as const,
  adId: "ad-1",
  integrationWhatsappId: "iw-1",
  since: "2026-08-01T00:00:00.000Z",
  until: "2026-08-10T23:59:59.999Z",
}

describe("handleSyncRetargetAudience", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWorkspaceIdOrFail.mockResolvedValue({
      id: "ifa-1",
      auth: "enc",
    })
    mocks.findWorkspace.mockResolvedValue({ targetCountry: "VN" })
    mocks.decryptObject.mockResolvedValue({
      authType: "custom",
      accessToken: "token-1",
      version: "v23.0",
    })
    mocks.runAction.mockResolvedValue({ received: 1, batches: 1 })
  })

  test("pages contacts and syncs accumulated contacts sequentially", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `ci-${index}`,
      email: `person${index}@example.com`,
      phoneNumber: null,
    }))
    mocks.listRetargetContacts
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([
        {
          id: "ci-501",
          email: null,
          phoneNumber: "+12025550101",
        },
      ])

    await handleSyncRetargetAudience(jobData)

    expect(mocks.withBlockedOwnerGuard).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Function),
    )
    expect(mocks.listRetargetContacts).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-1",
      segment: "conversations",
      adId: "ad-1",
      integrationWhatsappId: "iw-1",
      since: jobData.since,
      until: jobData.until,
      afterId: undefined,
      limit: 500,
    })
    expect(mocks.listRetargetContacts).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ afterId: "ci-499" }),
    )
    expect(mocks.runAction).toHaveBeenCalledWith(
      "bulkSyncHashedAudienceUsers",
      expect.objectContaining({
        props: expect.objectContaining({
          customAudienceId: "aud-1",
          operation: "add",
          fallbackCountry: "VN",
          contacts: expect.arrayContaining([
            { email: "person0@example.com", phoneNumber: null },
            { email: null, phoneNumber: "+12025550101" },
          ]),
        }),
      }),
    )
  })

  test("terminal auth error marks the integration invalid and stops without throwing", async () => {
    mocks.listRetargetContacts.mockResolvedValueOnce([
      { id: "ci-1", email: "person@example.com", phoneNumber: null },
    ])
    mocks.runAction.mockRejectedValueOnce(
      Object.assign(new Error("token expired"), { code: 190 }),
    )

    await expect(handleSyncRetargetAudience(jobData)).resolves.toBeUndefined()

    expect(mocks.markInvalid).toHaveBeenCalledWith("ws-1")
    expect(mocks.loggerError).toHaveBeenCalled()
  })

  test("retryable provider errors throw for BullMQ retry", async () => {
    mocks.listRetargetContacts.mockResolvedValueOnce([
      { id: "ci-1", email: "person@example.com", phoneNumber: null },
    ])
    mocks.runAction.mockRejectedValueOnce(
      Object.assign(new Error("rate limited"), { httpStatusCode: 429 }),
    )

    await expect(handleSyncRetargetAudience(jobData)).rejects.toThrow(
      "rate limited",
    )
    expect(mocks.markInvalid).not.toHaveBeenCalled()
  })
})
