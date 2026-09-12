import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  upsertForUser: vi.fn(),
  revoke: vi.fn(),
  encryptText: vi.fn(async (text: string) => ({
    v: 1,
    text,
    iv: "iv",
    tag: "tag",
  })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  userSoftphoneCredentialRepository: {
    upsertForUser: mocks.upsertForUser,
    revoke: mocks.revoke,
  },
}))
vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: { encryptText: mocks.encryptText },
}))

const { softphoneCredentialService } = await import(
  "../src/whatsapp-call/softphone-credential-service"
)

const TURN_USERNAME_RE = /^\d+:2$/

const nodes = {
  default: {
    sipDomain: "fs.example.com",
    wssUrl: "wss://fs.example.com:7443",
    turnUrl: "turn:fs.example.com:3478",
  },
}

beforeEach(() => {
  mocks.upsertForUser.mockReset()
  mocks.revoke.mockReset()
  mocks.encryptText.mockClear()
})

describe("softphoneCredentialService.issueCredentials", () => {
  test("mints ag-<ws>-<user>, encrypts the password, and returns node + TURN info", async () => {
    mocks.upsertForUser.mockResolvedValueOnce({ id: "cred-1" })

    const result = await softphoneCredentialService.issueCredentials({
      workspaceId: "1",
      userId: "2",
      nodes,
      nodeId: "default",
      turnStaticSecret: "shh",
    })

    expect(result.sipUsername).toBe("ag-1-2")
    expect(result.sipDomain).toBe("fs.example.com")
    expect(result.wssUrl).toBe("wss://fs.example.com:7443")
    expect(result.turn.urls).toBe("turn:fs.example.com:3478")
    expect(result.turn.username).toMatch(TURN_USERNAME_RE)
    expect(typeof result.turn.credential).toBe("string")
    expect(result.turn.credential.length).toBeGreaterThan(0)

    expect(mocks.encryptText).toHaveBeenCalledWith(result.password)
    expect(mocks.upsertForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "1",
        userId: "2",
        sipUsername: "ag-1-2",
      }),
    )
  })

  test("throws for a nodeId absent from FS_NODES", async () => {
    await expect(
      softphoneCredentialService.issueCredentials({
        workspaceId: "1",
        userId: "2",
        nodes,
        nodeId: "missing",
        turnStaticSecret: "shh",
      }),
    ).rejects.toThrow()
    expect(mocks.upsertForUser).not.toHaveBeenCalled()
  })
})

describe("softphoneCredentialService.revokeCredentials", () => {
  test("delegates to the repository", async () => {
    await softphoneCredentialService.revokeCredentials({
      workspaceId: "1",
      userId: "2",
    })
    expect(mocks.revoke).toHaveBeenCalledWith({ workspaceId: "1", userId: "2" })
  })
})
