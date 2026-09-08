import { beforeEach, describe, expect, test, vi } from "vitest"

const { repositoryMock, encryptObjectMock, decryptObjectMock } = vi.hoisted(
  () => ({
    repositoryMock: {
      findByWaba: vi.fn(),
      upsertCredential: vi.fn(),
      updateScopeCache: vi.fn(),
    },
    encryptObjectMock: vi.fn(),
    decryptObjectMock: vi.fn(),
  }),
)

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappBusinessAccountRepository: repositoryMock,
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: {
    encryptObject: encryptObjectMock,
    decryptObject: decryptObjectMock,
  },
}))

const { whatsappBusinessAccountService } = await import(
  "../src/whatsapp-business-account/service"
)

const encryptedCredential = {
  v: 1 as const,
  iv: "a".repeat(24),
  text: "cipher",
  tag: "b".repeat(32),
}

describe("WhatsappBusinessAccountService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    encryptObjectMock.mockResolvedValue(encryptedCredential)
    repositoryMock.upsertCredential.mockResolvedValue({ id: "waba-row" })
    repositoryMock.findByWaba.mockResolvedValue({
      id: "waba-row",
      credential: encryptedCredential,
    })
    decryptObjectMock.mockImplementation(
      (_credential: unknown, _schema: unknown, aad: string) => {
        if (aad !== "whatsapp-waba:ws-1:waba-1") {
          throw new Error("AAD authentication failed")
        }
        return { accessToken: "token-1", apiVersion: "v22.0" }
      },
    )
  })

  test("encrypts a WABA credential with its workspace-and-WABA AAD", async () => {
    await whatsappBusinessAccountService.upsertCredential({
      workspaceId: "ws-1",
      wabaId: "waba-1",
      businessId: "business-1",
      credential: { accessToken: "token-1", apiVersion: "v22.0" },
      grantedScopes: ["whatsapp_business_management"],
      scopeCheckedAt: new Date("2026-09-08T00:00:00.000Z"),
      expectedRevision: 0,
    })

    expect(encryptObjectMock).toHaveBeenCalledWith(
      { accessToken: "token-1", apiVersion: "v22.0" },
      "whatsapp-waba:ws-1:waba-1",
    )
    expect(repositoryMock.upsertCredential).toHaveBeenCalledWith(
      expect.objectContaining({ credential: encryptedCredential }),
    )
  })

  test("round-trips a credential using the same WABA AAD", async () => {
    await expect(
      whatsappBusinessAccountService.findDecryptedCredential({
        workspaceId: "ws-1",
        wabaId: "waba-1",
      }),
    ).resolves.toMatchObject({
      decryptedCredential: { accessToken: "token-1", apiVersion: "v22.0" },
    })

    expect(decryptObjectMock).toHaveBeenCalledWith(
      encryptedCredential,
      expect.anything(),
      "whatsapp-waba:ws-1:waba-1",
    )
  })

  test("rejects a credential when the WABA AAD does not match", async () => {
    await expect(
      whatsappBusinessAccountService.findDecryptedCredential({
        workspaceId: "ws-1",
        wabaId: "other-waba",
      }),
    ).rejects.toThrow("AAD authentication failed")
  })
})
