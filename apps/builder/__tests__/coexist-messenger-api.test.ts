// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDisable, mockEnable } = vi.hoisted(() => ({
  mockDisable: vi.fn(),
  mockEnable: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistService: {
    disable: mockDisable,
    enable: mockEnable,
  },
  isWorkspaceScheduledForDeletion: vi.fn(() => false),
  workspaceMemberService: {
    findMembership: vi.fn(async () => ({
      workspace: { id: "ws-1" },
      workspaceId: "ws-1",
      userId: "user-1",
    })),
  },
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        session: { id: "sess-1" },
        user: { id: "user-1", email: "test@test.com", isAnonymous: false },
      })),
    },
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      workspaceMemberModel: {
        findFirst: vi.fn(async () => ({
          workspace: { id: "ws-1" },
          workspaceId: "ws-1",
          userId: "user-1",
        })),
      },
    },
  },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

const { call } = await import("@orpc/server")
const { integrationInstagramCoexistAPIs } = await import(
  "@/features/integration-instagram/api/coexist"
)
const { integrationMessengerCoexistAPIs } = await import(
  "@/features/integration-messenger/api/coexist"
)

const stubContext = {
  headers: new Headers({ authorization: "Bearer test-token" }),
}

describe("coexist APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnable.mockResolvedValue({ success: true, runId: "run-1" })
    mockDisable.mockResolvedValue({ success: true })
  })

  test("Messenger enabled:true delegates to coexistService.enable", async () => {
    const result = await call(
      integrationMessengerCoexistAPIs.setCoexistMessengerAPI,
      { workspaceId: "ws-1", integrationId: "int-1", enabled: true },
      { context: stubContext },
    )

    expect(result).toEqual({ success: true })
    expect(mockEnable).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-1",
      channel: "messenger",
    })
    expect(mockDisable).not.toHaveBeenCalled()
  })

  test("Messenger enabled:false delegates to coexistService.disable", async () => {
    const result = await call(
      integrationMessengerCoexistAPIs.setCoexistMessengerAPI,
      { workspaceId: "ws-1", integrationId: "int-1", enabled: false },
      { context: stubContext },
    )

    expect(result).toEqual({ success: true })
    expect(mockDisable).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "int-1",
      channel: "messenger",
    })
  })

  test("Instagram endpoint delegates with channel instagram", async () => {
    const result = await call(
      integrationInstagramCoexistAPIs.setCoexistInstagramAPI,
      { workspaceId: "ws-1", integrationId: "ig-1", enabled: true },
      { context: stubContext },
    )

    expect(result).toEqual({ success: true, runId: "run-1" })
    expect(mockEnable).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      integrationId: "ig-1",
      channel: "instagram",
    })
  })

  test("Instagram endpoint returns not_found from coexistService", async () => {
    mockEnable.mockResolvedValueOnce({ success: false, reason: "not_found" })

    const result = await call(
      integrationInstagramCoexistAPIs.setCoexistInstagramAPI,
      { workspaceId: "ws-1", integrationId: "ig-1", enabled: true },
      { context: stubContext },
    )

    expect(result).toEqual({ success: false, reason: "not_found" })
  })
})
