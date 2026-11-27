// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }
type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const mocks = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const makeApi = () => {
    const chain = (route: RouteConfig) => {
      const record: CapturedProcedure = { route }
      capturedProcedures.push(record)
      const procedure = {
        input: vi.fn(() => procedure),
        output: vi.fn(() => procedure),
        errors: vi.fn(() => procedure),
        handler: vi.fn((fn: (...args: any[]) => any) => {
          record.handler = fn
          return { handler: fn }
        }),
      }
      return procedure
    }
    return { route: vi.fn(chain) }
  }
  return {
    capturedProcedures,
    api: makeApi(),
    listMyWorkspaces: vi.fn(),
    ensureFirstWorkspace: vi.fn(),
    mobileChangePassword: vi.fn(),
    mobileCreateWebHandoff: vi.fn(),
    registerDeviceToken: vi.fn(),
    resolveTenantSettings: vi.fn(),
    unregisterDeviceToken: vi.fn(),
    userService: { requestAccountDeletion: vi.fn() },
    mintMemberConnectToken: vi.fn(),
  }
})

vi.mock("@/orpc", () => ({
  mobileUserAPI: mocks.api,
  mobileUserPasswordChangeAPI: mocks.api,
  workspaceTokenAuthAPIForScope: () => mocks.api,
}))
vi.mock("@/features/workspaces/lib/list-my-workspaces", () => ({
  listMyWorkspaces: mocks.listMyWorkspaces,
}))
vi.mock("@/lib/workspace/create-first-workspace", () => ({
  ensureFirstWorkspace: mocks.ensureFirstWorkspace,
}))
vi.mock("@/features/device-tokens/lib/device-tokens", () => ({
  registerDeviceToken: mocks.registerDeviceToken,
  unregisterDeviceToken: mocks.unregisterDeviceToken,
}))
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      mobileChangePassword: mocks.mobileChangePassword,
      mobileCreateWebHandoff: mocks.mobileCreateWebHandoff,
    },
  },
}))
vi.mock("@/features/realtime/lib/mint-member-connect-token", () => ({
  mintMemberConnectToken: mocks.mintMemberConnectToken,
}))
vi.mock("@chatbotx.io/business", () => ({
  logger: { error: vi.fn() },
  resolveTenantSettings: mocks.resolveTenantSettings,
  userService: mocks.userService,
}))

const { APIError } = await import("better-auth/api")
await import("@/features/me/api/public")
await import("@/features/realtime/api/public")

const findProcedure = (method: string, path: string) => {
  const found = mocks.capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const user = {
  id: "7",
  name: "Agent",
  email: "agent@example.com",
  image: null,
  mustChangePassword: false,
}

const withContext = (
  headers: Record<string, string> = {},
  extra: Record<string, unknown> = {},
) => ({
  user,
  mobileDeviceId: "install-1",
  headers: new Headers(headers),
  resHeaders: new Headers(),
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /v1/me", () => {
  test("returns the identity of the signed-in user and nothing else", async () => {
    const result = await findProcedure("GET", "/v1/me").handler?.({
      context: withContext(),
    })

    expect(result).toEqual({
      id: "7",
      name: "Agent",
      email: "agent@example.com",
      image: null,
      mustChangePassword: false,
    })
  })

  test("surfaces mustChangePassword so the app can route to the password screen", async () => {
    const result = await findProcedure("GET", "/v1/me").handler?.({
      context: {
        ...withContext(),
        user: { ...user, mustChangePassword: true, image: "https://x/y.png" },
      },
    })

    expect(result).toMatchObject({
      mustChangePassword: true,
      image: "https://x/y.png",
    })
  })
})

describe("GET /v1/me/workspaces", () => {
  test("lists the workspaces of the token's user", async () => {
    mocks.listMyWorkspaces.mockResolvedValue({ workspaces: [{ id: "42" }] })

    const result = await findProcedure("GET", "/v1/me/workspaces").handler?.({
      context: withContext(),
    })

    expect(mocks.listMyWorkspaces).toHaveBeenCalledWith("7")
    expect(result).toEqual({ workspaces: [{ id: "42" }] })
  })
})

describe("/v1/me/device-tokens", () => {
  const register = () => findProcedure("PUT", "/v1/me/device-tokens")

  test("registers for the token's user, bound to the x-workspace-id header when sent", async () => {
    mocks.registerDeviceToken.mockResolvedValue({ success: true })

    await register().handler?.({
      context: withContext({ "x-workspace-id": " 42 " }),
      input: { platform: "ios", token: "ExponentPushToken[abc]" },
    })

    expect(mocks.registerDeviceToken).toHaveBeenCalledWith("7", {
      platform: "ios",
      token: "ExponentPushToken[abc]",
      workspaceId: "42",
    })
  })

  test("registers for the account only without the header", async () => {
    mocks.registerDeviceToken.mockResolvedValue({ success: true })

    await register().handler?.({
      context: withContext(),
      input: { platform: "android", token: "t" },
    })

    expect(mocks.registerDeviceToken).toHaveBeenCalledWith("7", {
      platform: "android",
      token: "t",
      workspaceId: undefined,
    })
  })

  test("a non-numeric workspace header is rejected before touching the database", async () => {
    await expect(
      register().handler?.({
        context: withContext({ "x-workspace-id": "abc" }),
        input: { platform: "ios", token: "t" },
      }),
    ).rejects.toThrow()
    expect(mocks.registerDeviceToken).not.toHaveBeenCalled()
  })

  test("unregister removes the token for the token's user only", async () => {
    mocks.unregisterDeviceToken.mockResolvedValue({ success: true })

    await findProcedure("DELETE", "/v1/me/device-tokens").handler?.({
      context: withContext(),
      input: { token: "t" },
    })

    expect(mocks.unregisterDeviceToken).toHaveBeenCalledWith("7", {
      token: "t",
    })
  })
})

describe("POST /v1/me/web-handoff", () => {
  test("returns a browser handoff URL for the token's user", async () => {
    mocks.mobileCreateWebHandoff.mockResolvedValue({ code: "handoff-code" })

    const result = await findProcedure("POST", "/v1/me/web-handoff").handler?.({
      context: withContext({}, { url: new URL("https://app.example.com/api") }),
      input: {},
    })

    expect(mocks.mobileCreateWebHandoff).toHaveBeenCalledWith({
      body: { userId: "7" },
    })
    expect(result).toEqual({
      url: "https://app.example.com/api/auth/account/handoff?code=handoff-code",
    })
  })
})

describe("DELETE /v1/me", () => {
  test("requires DELETE exactly before scheduling account deletion", async () => {
    const { accountDeletionRequest } = await import(
      "@/features/me/schema/public"
    )

    expect(
      accountDeletionRequest.safeParse({ confirmation: "delete" }).success,
    ).toBe(false)
  })

  test("schedules the signed-in account after validation", async () => {
    const scheduledDeletionAt = new Date("2026-11-13T12:00:00.000Z")
    mocks.userService.requestAccountDeletion.mockResolvedValue({
      scheduledDeletionAt,
    })

    const result = await findProcedure("DELETE", "/v1/me").handler?.({
      context: withContext(),
      input: { confirmation: "DELETE" },
    })

    expect(mocks.userService.requestAccountDeletion).toHaveBeenCalledWith({
      actor: { userId: "7" },
      userId: "7",
    })
    expect(result).toEqual({ scheduledDeletionAt })
  })

  test("marks the deletion response private and does not cache it", async () => {
    const context = withContext()
    mocks.userService.requestAccountDeletion.mockResolvedValue({
      scheduledDeletionAt: new Date("2026-11-13T12:00:00.000Z"),
    })

    await findProcedure("DELETE", "/v1/me").handler?.({
      context,
      input: { confirmation: "DELETE" },
    })

    expect(context.resHeaders.get("cache-control")).toBe("no-store")
    expect(context.resHeaders.get("pragma")).toBe("no-cache")
  })

  test("preserves the reseller support refusal and its 403 status", async () => {
    const { ChatbotXException } = await import("@chatbotx.io/business/errors")
    mocks.userService.requestAccountDeletion.mockRejectedValue(
      new ChatbotXException(
        "Reseller accounts must contact support to delete their account",
        "accountDeletionSupportRequired",
        403,
      ),
    )

    await expect(
      findProcedure("DELETE", "/v1/me").handler?.({
        context: withContext(),
        input: { confirmation: "DELETE" },
      }),
    ).rejects.toMatchObject({
      code: "accountDeletionSupportRequired",
      httpStatusCode: 403,
    })
  })
})

describe("POST /v1/me/password", () => {
  const change = () => findProcedure("POST", "/v1/me/password")
  const tokens = { accessToken: "a", refreshToken: "r", deviceId: "install-1" }

  test("changes the password of the token's user and returns the fresh token pair", async () => {
    mocks.mobileChangePassword.mockResolvedValue(tokens)
    const context = withContext()

    const result = await change().handler?.({
      context,
      input: { currentPassword: "old-password", newPassword: "new-password-1" },
    })

    expect(mocks.mobileChangePassword).toHaveBeenCalledWith({
      body: {
        userId: "7",
        currentPassword: "old-password",
        newPassword: "new-password-1",
        deviceId: "install-1",
      },
    })
    expect(context.resHeaders.get("cache-control")).toBe("no-store")
    expect(context.resHeaders.get("pragma")).toBe("no-cache")
    expect(result).toBe(tokens)
  })

  test("the body can name a different device id for the new token family", async () => {
    mocks.mobileChangePassword.mockResolvedValue(tokens)

    await change().handler?.({
      context: withContext(),
      input: {
        currentPassword: "old-password",
        newPassword: "new-password-1",
        deviceId: "install-2",
      },
    })

    expect(mocks.mobileChangePassword.mock.calls[0][0].body.deviceId).toBe(
      "install-2",
    )
  })

  test("a rejected password is a 400 changePasswordFailed, not a 500", async () => {
    mocks.mobileChangePassword.mockRejectedValue(
      APIError.from("BAD_REQUEST", {
        code: "INVALID_PASSWORD",
        message: "Invalid password",
      }),
    )

    await expect(
      change().handler?.({
        context: withContext(),
        input: { currentPassword: "wrong", newPassword: "new-password-1" },
      }),
    ).rejects.toMatchObject({
      code: "changePasswordFailed",
      httpStatusCode: 400,
      message: "Invalid password",
    })
  })

  test("unexpected failures are not swallowed", async () => {
    mocks.mobileChangePassword.mockRejectedValue(new Error("db down"))

    await expect(
      change().handler?.({
        context: withContext(),
        input: {
          currentPassword: "old-password",
          newPassword: "new-password-1",
        },
      }),
    ).rejects.toThrow("db down")
  })
})

describe("GET /v1/realtime/connect-token", () => {
  const connect = () => findProcedure("GET", "/v1/realtime/connect-token")
  const member = {
    userId: "7",
    permissions: { contacts: true, onlyAssignedContacts: true },
  }

  test("mints a token for the member and returns the tenant's realtime url", async () => {
    mocks.mintMemberConnectToken.mockResolvedValue("signed")
    mocks.resolveTenantSettings.mockResolvedValue({
      publicRealtimeUrl: "https://chat.example.com/ws/",
    })

    const result = await connect().handler?.({
      context: {
        workspace: { id: "42" },
        member,
        requestIssuedAtMs: 1234,
      },
    })

    expect(mocks.mintMemberConnectToken).toHaveBeenCalledWith({
      workspaceId: "42",
      userId: "7",
      permissions: member.permissions,
      issuedAtMs: 1234,
    })
    expect(mocks.resolveTenantSettings).toHaveBeenCalledWith({
      workspaceId: "42",
    })
    expect(result).toEqual({
      token: "signed",
      url: "https://chat.example.com/ws/",
      socketUrl: "wss://chat.example.com/ws/rt/workspaces/42",
    })
  })

  test("uses ws:// for a plain-http (local) deployment", async () => {
    mocks.mintMemberConnectToken.mockResolvedValue("signed")
    mocks.resolveTenantSettings.mockResolvedValue({
      publicRealtimeUrl: "http://localhost:3123/ws/",
    })

    const result = await connect().handler?.({
      context: { workspace: { id: "42" }, member, requestIssuedAtMs: 1 },
    })

    expect(result.socketUrl).toBe("ws://localhost:3123/ws/rt/workspaces/42")
  })

  test("a workspace API token or MCP token has no member and is refused", async () => {
    await expect(
      connect().handler?.({ context: { workspace: { id: "42" } } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(mocks.mintMemberConnectToken).not.toHaveBeenCalled()
  })
})

describe("POST /v1/me/workspaces/default", () => {
  const call = (input: Record<string, unknown> = {}) =>
    findProcedure("POST", "/v1/me/workspaces/default").handler?.({
      context: withContext(),
      input,
    })

  test("creates the first workspace when the user has no membership", async () => {
    mocks.listMyWorkspaces.mockResolvedValue({ workspaces: [] })
    mocks.ensureFirstWorkspace.mockResolvedValue({ id: "9" })

    expect(await call({ name: "Mine" })).toEqual({ workspace: { id: "9" } })
    expect(mocks.ensureFirstWorkspace).toHaveBeenCalledWith("7", {
      name: "Mine",
    })
  })

  test("falls back to a default name", async () => {
    mocks.listMyWorkspaces.mockResolvedValue({ workspaces: [] })
    mocks.ensureFirstWorkspace.mockResolvedValue({ id: "9" })

    await call()
    expect(mocks.ensureFirstWorkspace).toHaveBeenCalledWith("7", {
      name: "Agent's workspace",
    })
  })

  test("returns null without creating when memberships exist", async () => {
    mocks.listMyWorkspaces.mockResolvedValue({ workspaces: [{ id: "1" }] })

    expect(await call()).toEqual({ workspace: null })
    expect(mocks.ensureFirstWorkspace).not.toHaveBeenCalled()
  })

  test("returns null when plan limits block creation", async () => {
    mocks.listMyWorkspaces.mockResolvedValue({ workspaces: [] })
    mocks.ensureFirstWorkspace.mockResolvedValue(null)

    expect(await call()).toEqual({ workspace: null })
  })
})
