import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  dbQueryFindFirstMock,
  dbUpdateBuilderMock,
  dbUpdateMock,
  repositoryMock,
  encryptTextMock,
  decryptTextMock,
} = vi.hoisted(() => ({
  dbQueryFindFirstMock: vi.fn(),
  dbUpdateBuilderMock: {
    returning: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
  },
  dbUpdateMock: vi.fn(),
  repositoryMock: {
    createSignupSession: vi.fn(),
    consumeSignupSession: vi.fn(),
    findConnectedPhoneNumberIds: vi.fn(),
  },
  encryptTextMock: vi.fn(),
  decryptTextMock: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: {
    query: {
      integrationWhatsappModel: {
        findFirst: dbQueryFindFirstMock,
      },
    },
    update: dbUpdateMock,
  },
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  isNull: vi.fn((column: unknown) => ({ column, operator: "isNull" })),
  lt: vi.fn((left: unknown, right: unknown) => ({
    left,
    operator: "lt",
    right,
  })),
  or: vi.fn((...conditions: unknown[]) => ({ conditions, operator: "or" })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: repositoryMock,
}))

vi.mock("@chatbotx.io/encryption", async () => {
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/encryption")
  >("@chatbotx.io/encryption")
  return {
    ...actual,
    encryptUtils: {
      encryptText: encryptTextMock,
      decryptText: decryptTextMock,
    },
  }
})

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)
const { ChannelError, ChannelErrorCategory } = await import("@chatbotx.io/sdk")

describe("integrationWhatsappService signup sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbUpdateMock.mockReturnValue(dbUpdateBuilderMock)
    dbUpdateBuilderMock.set.mockReturnValue(dbUpdateBuilderMock)
    dbUpdateBuilderMock.where.mockReturnValue(dbUpdateBuilderMock)
    dbUpdateBuilderMock.returning.mockResolvedValue([])
  })

  test("encrypts access token before creating a signup session", async () => {
    const encryptedAccessToken = {
      v: 1,
      iv: "0".repeat(24),
      text: "ciphertext",
      tag: "1".repeat(32),
    }
    encryptTextMock.mockResolvedValue(encryptedAccessToken)
    repositoryMock.createSignupSession.mockResolvedValue({ id: "session-1" })

    const result = await integrationWhatsappService.createSignupSession({
      userId: "user-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      wabaId: "waba-1",
      businessId: "business-1",
      accessToken: "plain-token",
      apiVersion: "v23.0",
      candidatePhoneNumberIds: ["phone-1"],
    })

    expect(result).toEqual({ id: "session-1" })
    expect(encryptTextMock).toHaveBeenCalledWith("plain-token")
    expect(repositoryMock.createSignupSession).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptedAccessToken,
        candidatePhoneNumberIds: ["phone-1"],
      }),
    )
  })

  test("decrypts access token after atomically consuming a session", async () => {
    const encryptedAccessToken = {
      v: 1,
      iv: "0".repeat(24),
      text: "ciphertext",
      tag: "1".repeat(32),
    }
    repositoryMock.consumeSignupSession.mockResolvedValue({
      id: "session-1",
      encryptedAccessToken,
    })
    decryptTextMock.mockResolvedValue("plain-token")

    const result = await integrationWhatsappService.consumeSignupSession({
      id: "session-1",
      userId: "user-1",
      ownerId: "owner-1",
      phoneNumberId: "phone-1",
    })

    expect(result).toMatchObject({
      id: "session-1",
      accessToken: "plain-token",
    })
    expect(repositoryMock.consumeSignupSession).toHaveBeenCalledWith({
      id: "session-1",
      userId: "user-1",
      ownerId: "owner-1",
      phoneNumberId: "phone-1",
    })
  })

  test("returns null when the repository cannot consume the session", async () => {
    repositoryMock.consumeSignupSession.mockResolvedValue(null)

    const result = await integrationWhatsappService.consumeSignupSession({
      id: "session-1",
      userId: "user-1",
      ownerId: "owner-1",
      phoneNumberId: "phone-1",
    })

    expect(result).toBeNull()
    expect(decryptTextMock).not.toHaveBeenCalled()
  })

  test("stores Meta user-facing registration error details", async () => {
    const error = new ChannelError(
      "Invalid parameter",
      ChannelErrorCategory.PAYLOAD_INVALID,
      {
        code: 100,
        subCode: 2_593_005,
        type: "OAuthException",
      },
    ).setOriginError({
      userTitle: "Phone number is not verified",
      userMessage: "Phone number is not verified through SMS or voice.",
      fbtraceId: "trace-1",
    })

    dbUpdateBuilderMock.returning.mockResolvedValueOnce([
      { registrationError: null },
    ])

    const result = await integrationWhatsappService.recordRegistrationOutcome({
      id: "integration-1",
      workspaceId: "workspace-1",
      outcome: { status: "failed", error },
    })

    expect(result).toBeNull()
    expect(dbUpdateBuilderMock.set).toHaveBeenCalledWith({
      registrationStatus: "failed",
      registrationError: expect.objectContaining({
        code: 100,
        subCode: 2_593_005,
        message: "Invalid parameter",
        type: "OAuthException",
        userTitle: "Phone number is not verified",
        userMessage: "Phone number is not verified through SMS or voice.",
        fbtraceId: "trace-1",
      }),
    })
  })

  test("claims a verification code request slot atomically", async () => {
    const requestedAt = new Date("2026-07-27T08:00:00.000Z")
    dbUpdateBuilderMock.returning.mockResolvedValueOnce([{ requestedAt }])

    const result = await integrationWhatsappService.claimVerificationCodeSlot({
      id: "integration-1",
      workspaceId: "workspace-1",
      cooldownSeconds: 60,
      now: requestedAt,
    })

    expect(result).toEqual({ status: "claimed", requestedAt })
    expect(dbUpdateBuilderMock.set).toHaveBeenCalledWith({
      verificationCodeRequestedAt: requestedAt,
    })
    expect(dbQueryFindFirstMock).not.toHaveBeenCalled()
  })

  test("returns remaining cooldown when verification code was requested recently", async () => {
    dbUpdateBuilderMock.returning.mockResolvedValueOnce([])
    dbQueryFindFirstMock.mockResolvedValueOnce({
      verificationCodeRequestedAt: new Date("2026-07-27T08:00:10.000Z"),
    })

    const result = await integrationWhatsappService.claimVerificationCodeSlot({
      id: "integration-1",
      workspaceId: "workspace-1",
      cooldownSeconds: 60,
      now: new Date("2026-07-27T08:00:30.000Z"),
    })

    expect(result).toEqual({
      status: "cooldown",
      requestedAt: new Date("2026-07-27T08:00:10.000Z"),
      remainingSeconds: 40,
    })
  })
})
