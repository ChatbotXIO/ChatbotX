import { beforeEach, describe, expect, test, vi } from "vitest"

// The service owns no SQL of its own — every statement lives in the repository,
// so this suite mocks that boundary and asserts on what the service asks for.
const { repositoryMock, encryptTextMock, decryptTextMock } = vi.hoisted(() => ({
  repositoryMock: {
    createSignupSession: vi.fn(),
    consumeSignupSession: vi.fn(),
    findActiveSignupSession: vi.fn(),
    findConnectedPhoneNumberIds: vi.fn(),
    findVerificationCodeRequestedAt: vi.fn(),
    claimVerificationCodeSlot: vi.fn(),
    releaseVerificationCodeSlot: vi.fn(),
    purgeFinishedSignupSessions: vi.fn(),
    updateRegistration: vi.fn(),
  },
  encryptTextMock: vi.fn(),
  decryptTextMock: vi.fn(),
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
    repositoryMock.updateRegistration.mockResolvedValue(null)
    repositoryMock.claimVerificationCodeSlot.mockResolvedValue(null)
    repositoryMock.findVerificationCodeRequestedAt.mockResolvedValue(null)
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

    const result = await integrationWhatsappService.recordRegistrationOutcome({
      id: "integration-1",
      workspaceId: "workspace-1",
      outcome: { status: "failed", error },
    })

    expect(result).toBeNull()
    expect(repositoryMock.updateRegistration).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "workspace-1",
      values: {
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
      },
    })
  })

  test("claims a verification code request slot atomically", async () => {
    const requestedAt = new Date("2026-07-27T08:00:00.000Z")
    repositoryMock.claimVerificationCodeSlot.mockResolvedValueOnce(requestedAt)

    const result = await integrationWhatsappService.claimVerificationCodeSlot({
      id: "integration-1",
      workspaceId: "workspace-1",
      cooldownSeconds: 60,
      now: requestedAt,
    })

    expect(result).toEqual({ status: "claimed", requestedAt })
    // The cutoff is the service's job: the repository only applies whatever
    // window it is handed.
    expect(repositoryMock.claimVerificationCodeSlot).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "workspace-1",
      now: requestedAt,
      cutoff: new Date("2026-07-27T07:59:00.000Z"),
    })
    expect(
      repositoryMock.findVerificationCodeRequestedAt,
    ).not.toHaveBeenCalled()
  })

  test("returns remaining cooldown when verification code was requested recently", async () => {
    repositoryMock.findVerificationCodeRequestedAt.mockResolvedValueOnce({
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

  test("reports not_found when neither the claim nor the row lookup matches", async () => {
    const result = await integrationWhatsappService.claimVerificationCodeSlot({
      id: "missing",
      workspaceId: "workspace-1",
      cooldownSeconds: 60,
    })

    expect(result).toEqual({ status: "not_found" })
  })

  test("allows an immediate retry when a released slot left no timestamp", async () => {
    // A concurrent request that failed at Meta clears the timestamp on its way
    // out, so the row exists with nothing to wait for.
    repositoryMock.findVerificationCodeRequestedAt.mockResolvedValueOnce({
      verificationCodeRequestedAt: null,
    })

    const result = await integrationWhatsappService.claimVerificationCodeSlot({
      id: "integration-1",
      workspaceId: "workspace-1",
      cooldownSeconds: 60,
      now: new Date("2026-07-27T08:00:30.000Z"),
    })

    expect(result).toEqual({
      status: "cooldown",
      requestedAt: null,
      remainingSeconds: 0,
    })
  })
})
