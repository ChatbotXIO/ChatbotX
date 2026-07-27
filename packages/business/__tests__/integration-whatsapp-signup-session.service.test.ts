import { beforeEach, describe, expect, test, vi } from "vitest"

const { repositoryMock, encryptTextMock, decryptTextMock } = vi.hoisted(() => ({
  repositoryMock: {
    createSignupSession: vi.fn(),
    consumeSignupSession: vi.fn(),
    findConnectedPhoneNumberIds: vi.fn(),
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

describe("integrationWhatsappService signup sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
