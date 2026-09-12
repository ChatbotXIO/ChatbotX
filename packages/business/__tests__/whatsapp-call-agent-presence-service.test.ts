import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  upsertFromRegister: vi.fn(),
  expire: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  agentSipPresenceRepository: {
    upsertFromRegister: mocks.upsertFromRegister,
    expire: mocks.expire,
  },
}))

const {
  agentPresenceService,
  parseAgentSipUsername,
  InvalidAgentSipUsernameError,
} = await import("../src/whatsapp-call/agent-presence-service")

beforeEach(() => {
  mocks.upsertFromRegister.mockReset()
  mocks.expire.mockReset()
})

describe("parseAgentSipUsername", () => {
  test("parses ag-<workspaceId>-<userId>", () => {
    expect(parseAgentSipUsername("ag-42-7")).toEqual({
      workspaceId: "42",
      userId: "7",
    })
  })

  test("rejects a malformed username", () => {
    expect(() => parseAgentSipUsername("not-an-agent")).toThrow(
      InvalidAgentSipUsernameError,
    )
  })
})

describe("agentPresenceService.applyRegistrationEvent (table dispatch)", () => {
  test("register -> upsertFromRegister", async () => {
    const expiresAt = new Date()
    await agentPresenceService.applyRegistrationEvent({
      kind: "register",
      username: "ag-1-2",
      contact: "sip:ag-1-2@fs.example.com",
      expiresAt,
    })
    expect(mocks.upsertFromRegister).toHaveBeenCalledWith({
      workspaceId: "1",
      userId: "2",
      contact: "sip:ag-1-2@fs.example.com",
      expiresAt,
    })
    expect(mocks.expire).not.toHaveBeenCalled()
  })

  test("unregister -> expire", async () => {
    await agentPresenceService.applyRegistrationEvent({
      kind: "unregister",
      username: "ag-1-2",
      contact: null,
      expiresAt: new Date(),
    })
    expect(mocks.expire).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1", userId: "2" }),
    )
    expect(mocks.upsertFromRegister).not.toHaveBeenCalled()
  })

  test("expire -> expire", async () => {
    await agentPresenceService.applyRegistrationEvent({
      kind: "expire",
      username: "ag-1-2",
      contact: null,
      expiresAt: new Date(),
    })
    expect(mocks.expire).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1", userId: "2" }),
    )
  })

  test("rejects a malformed username before touching the repository", async () => {
    await expect(
      agentPresenceService.applyRegistrationEvent({
        kind: "register",
        username: "bad",
        contact: null,
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(InvalidAgentSipUsernameError)
    expect(mocks.upsertFromRegister).not.toHaveBeenCalled()
  })
})
