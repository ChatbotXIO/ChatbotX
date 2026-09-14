import { beforeEach, describe, expect, test, vi } from "vitest"

const authRepository = {
  findByWorkspaceId: vi.fn(),
  create: vi.fn(),
  updateAuth: vi.fn(),
  updateStatus: vi.fn(),
}

vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessagesAuthRepository: authRepository,
  facebookMarketingMessageRepository: {
    listByWorkspaceId: vi.fn(),
    findForWorkspace: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

// `dispatchAuditRecord` throws outside production unless the real audit
// service has been imported to register itself. Mocked per the convention in
// the sibling business service tests.
vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
}))

vi.mock("@chatbotx.io/encryption", () => ({
  // Passthrough stand-in for the real `EncryptedData` validator: these tests
  // exercise the service's branching, not the envelope format.
  encryptedDataSchema: { parse: (value: unknown) => value },
  encryptUtils: {
    encryptObject: vi.fn(async (value: unknown) => ({ cipher: value })),
    decryptObject: vi.fn(async (value: { cipher: unknown }) => value.cipher),
  },
}))

const { facebookMarketingMessagesService } = await import(
  "../src/facebook-marketing-messages/service"
)

const auth = {
  authType: "custom",
  accessToken: "TOKEN",
  expiresAt: "2026-11-01T00:00:00.000Z",
  version: "v25.0",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("upsertAuth", () => {
  test("encrypts the token before it reaches the repository", async () => {
    authRepository.findByWorkspaceId.mockResolvedValue(null)

    await facebookMarketingMessagesService.upsertAuth({
      workspaceId: "w1",
      auth,
      tokenExpiresAt: new Date("2026-11-01T00:00:00.000Z"),
      facebookUserId: "asuid-1",
    })

    expect(authRepository.create).toHaveBeenCalledTimes(1)
    const [values] = authRepository.create.mock.calls[0]
    expect(values.auth).toEqual({ cipher: auth })
    expect(values.auth).not.toHaveProperty("accessToken")
    expect(values.facebookUserId).toBe("asuid-1")
  })

  test("re-granting updates the existing row instead of inserting a second one", async () => {
    authRepository.findByWorkspaceId.mockResolvedValue({
      id: "a1",
      workspaceId: "w1",
    })

    await facebookMarketingMessagesService.upsertAuth({
      workspaceId: "w1",
      auth,
      tokenExpiresAt: null,
      facebookUserId: "asuid-2",
    })

    expect(authRepository.create).not.toHaveBeenCalled()
    expect(authRepository.updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1", facebookUserId: "asuid-2" }),
    )
  })

  test("tolerates a missing App-Scoped User ID", async () => {
    authRepository.findByWorkspaceId.mockResolvedValue(null)

    await facebookMarketingMessagesService.upsertAuth({
      workspaceId: "w1",
      auth,
      tokenExpiresAt: null,
      facebookUserId: undefined,
    })

    const [values] = authRepository.create.mock.calls[0]
    expect(values.facebookUserId).toBeNull()
  })
})

describe("decryptAuth", () => {
  test("returns the token object", async () => {
    const result = await facebookMarketingMessagesService.decryptAuth({
      auth: { cipher: auth },
    } as never)

    expect(result).toEqual(auth)
  })

  test("returns null instead of throwing when the blob cannot be decrypted", async () => {
    const { encryptUtils } = await import("@chatbotx.io/encryption")
    vi.mocked(encryptUtils.decryptObject).mockRejectedValueOnce(
      new Error("bad key"),
    )

    const result = await facebookMarketingMessagesService.decryptAuth({
      auth: { cipher: auth },
    } as never)

    expect(result).toBeNull()
  })
})

describe("markAuthInvalid", () => {
  test("flips the row to invalid", async () => {
    await facebookMarketingMessagesService.markAuthInvalid("w1")

    expect(authRepository.updateStatus).toHaveBeenCalledWith({
      workspaceId: "w1",
      status: "invalid",
    })
  })
})
