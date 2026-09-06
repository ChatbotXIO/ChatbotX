import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// integrationWhatsappService.connectPhoneNumber — signup session consumed
// with the tx; a unique violation on the phone-number index maps to the
// typed exception; createdWorkspace is true only when no workspaceId was
// supplied.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  consumeSignupSession: vi.fn(),
  createWorkspace: vi.fn(),
  isConnected: vi.fn(),
  createInbox: vi.fn(),
  insert: vi.fn(),
  createId: vi.fn(() => "new-id"),
  isUniqueViolationError: vi.fn(() => false),
  decryptText: vi.fn(() => Promise.resolve("decrypted-token")),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: mocks.createId,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  isUniqueViolationError: mocks.isUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    consumeSignupSession: mocks.consumeSignupSession,
  },
  metaCapiEventRepository: {},
  whatsappCoexistStagingRepository: {},
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { create: mocks.createWorkspace },
}))

vi.mock("../src/inbox/connect-channel", () => ({
  connectChannelIntegration: vi.fn(
    async ({
      insertIntegration,
    }: {
      tx: unknown
      insertIntegration: (inboxId: string, wasCreated: boolean) => unknown
    }) => {
      const isConnected = await mocks.isConnected()
      if (isConnected) {
        throw new Error("channel already connected")
      }
      const wasCreated = true
      const integration = await insertIntegration("inbox_new", wasCreated)
      return { inbox: { id: "inbox_new" }, wasCreated, integration }
    },
  ),
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: vi.fn() },
}))

vi.mock("../src/coexist/service", () => ({
  coexistService: { tearDownForIntegration: vi.fn() },
}))

vi.mock("@chatbotx.io/encryption", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/encryption")>()
  return {
    ...actual,
    encryptUtils: {
      ...actual.encryptUtils,
      decryptText: mocks.decryptText,
    },
  }
})

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)

const phoneNumber = {
  id: "phone_1",
  verified_name: "Acme Support",
  display_phone_number: "+1 555 0100",
}

describe("integrationWhatsappService.connectPhoneNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isUniqueViolationError.mockReturnValue(false)
    mocks.isConnected.mockResolvedValue(false)
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) => {
        const tx = {
          insert: mocks.insert,
        }
        return await callback(tx)
      },
    )
    mocks.insert.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn(() =>
        Promise.resolve([
          { id: "iw_1", workspaceId: "ws_created", phoneNumberId: "phone_1" },
        ]),
      ),
    })
  })

  test("spends the signup session claim with the connect tx", async () => {
    mocks.consumeSignupSession.mockResolvedValue({
      id: "session_1",
      encryptedAccessToken: {
        v: 1,
        iv: "0".repeat(24),
        text: "encrypted-text",
        tag: "0".repeat(32),
      },
    })
    mocks.createWorkspace.mockResolvedValue({ id: "ws_created" })

    await integrationWhatsappService.connectPhoneNumber({
      signupSessionClaim: {
        id: "session_1",
        userId: "user_1",
        ownerId: "owner_1",
        phoneNumberId: "phone_1",
      },
      ownerId: "owner_1",
      userId: "user_1",
      integrationId: "iw_1",
      phoneNumber,
      displayPhoneNumber: "+15550100",
      phoneName: "Acme Support",
      wabaId: "waba_1",
      businessId: "biz_1",
      auth: { tokens: { accessToken: "tok" } },
      isCoexist: false,
      platformType: "CLOUD_API",
    })

    expect(mocks.consumeSignupSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session_1", tx: expect.anything() }),
    )
  })

  test("createdWorkspace is true only when no workspaceId was supplied", async () => {
    mocks.createWorkspace.mockResolvedValue({ id: "ws_created" })

    const result = await integrationWhatsappService.connectPhoneNumber({
      ownerId: "owner_1",
      userId: "user_1",
      integrationId: "iw_1",
      phoneNumber,
      displayPhoneNumber: "+15550100",
      phoneName: "Acme Support",
      wabaId: "waba_1",
      businessId: "biz_1",
      auth: {},
      isCoexist: false,
      platformType: "CLOUD_API",
    })

    expect(result.createdWorkspace).toBe(true)
    expect(mocks.createWorkspace).toHaveBeenCalledOnce()
  })

  test("does not create a workspace when workspaceId is supplied", async () => {
    const result = await integrationWhatsappService.connectPhoneNumber({
      ownerId: "owner_1",
      userId: "user_1",
      workspaceId: "ws_existing",
      integrationId: "iw_1",
      phoneNumber,
      displayPhoneNumber: "+15550100",
      phoneName: "Acme Support",
      wabaId: "waba_1",
      businessId: "biz_1",
      auth: {},
      isCoexist: false,
      platformType: "CLOUD_API",
    })

    expect(result.createdWorkspace).toBe(false)
    expect(mocks.createWorkspace).not.toHaveBeenCalled()
  })

  test("maps a unique-violation on the phone-number index to the typed exception", async () => {
    mocks.isUniqueViolationError.mockReturnValue(true)
    mocks.transaction.mockRejectedValueOnce(new Error("unique violation"))

    await expect(
      integrationWhatsappService.connectPhoneNumber({
        ownerId: "owner_1",
        userId: "user_1",
        workspaceId: "ws_existing",
        integrationId: "iw_1",
        phoneNumber,
        displayPhoneNumber: "+15550100",
        phoneName: "Acme Support",
        wabaId: "waba_1",
        businessId: "biz_1",
        auth: {},
        isCoexist: false,
        platformType: "CLOUD_API",
      }),
    ).rejects.toMatchObject({ code: "whatsappPhoneNumberAlreadyConnected" })
  })
})
