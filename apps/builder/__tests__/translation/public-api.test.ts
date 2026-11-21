// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type Captured = {
  route: { method: string; path: string }
  scope: string | string[]
  handler?: (...args: any[]) => any
}

const { orpcMock, captured } = vi.hoisted(() => {
  const captured: Captured[] = []
  return {
    captured,
    orpcMock: {
      workspaceTokenAuthAPIForScope: (scope: string | string[]) => ({
        route: (route: Captured["route"]) => {
          const record: Captured = { route, scope }
          captured.push(record)
          const chain: Record<string, unknown> = {}
          for (const name of ["input", "output", "errors"]) {
            chain[name] = () => chain
          }
          chain.handler = (fn: (...args: any[]) => any) => {
            record.handler = fn
            return { handler: fn }
          }
          return chain
        },
      }),
    },
  }
})
vi.mock("@/orpc", () => orpcMock)

const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  toSettingsResource: vi.fn(),
  updateSettings: vi.fn(),
  testSettings: vi.fn(),
  getState: vi.fn(),
  updateState: vi.fn(),
  request: vi.fn(),
  preview: vi.fn(),
}))

// `next-intl/server` resolves to the react-client build under Vitest, whose
// `getTranslations` throws. Mirrors the real `errors.superAdminRequired` value.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) =>
    key === "errors.superAdminRequired"
      ? "You need to be a workspace super admin to do this."
      : key,
}))
vi.mock("@/lib/public-api/member-scope", () => ({
  assertConversationAccessForCaller: mocks.assertAccess,
}))
vi.mock("@/features/translation/lib/availability", () => ({
  toSettingsResource: mocks.toSettingsResource,
}))
vi.mock("@/features/translation/lib/update-settings", () => ({
  updateTranslationSettings: mocks.updateSettings,
}))
vi.mock("@/features/translation/lib/test-settings", () => ({
  testTranslationSettings: mocks.testSettings,
}))
vi.mock("@/features/translation/lib/conversation-state", () => ({
  getConversationTranslationState: mocks.getState,
  updateConversationTranslationState: mocks.updateState,
}))
vi.mock("@/features/translation/lib/request-messages", () => ({
  requestTranslations: mocks.request,
}))
vi.mock("@/features/translation/lib/preview-text", () => ({
  previewTranslation: mocks.preview,
}))

await import("@/features/translation/api/public")

const find = (method: string, path: string) => {
  const found = captured.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found?.handler) {
    throw new Error(`no procedure ${method} ${path}`)
  }
  return found as Captured & { handler: (...args: any[]) => any }
}

const workspace = { id: "ws-1" }
const conversation = { id: "conv-1" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertAccess.mockResolvedValue(conversation)
})

describe("translation public API scopes", () => {
  test.each([
    ["GET", "/v1/translation/settings", ["settings", "inbox"]],
    ["PUT", "/v1/translation/settings", "settings"],
    ["POST", "/v1/translation/settings/test", "settings"],
    ["GET", "/v1/conversations/{conversationId}/translation", "inbox"],
    ["PUT", "/v1/conversations/{conversationId}/translation", "inbox"],
    [
      "POST",
      "/v1/conversations/{conversationId}/translation/requests",
      "inbox",
    ],
    ["POST", "/v1/conversations/{conversationId}/translation/preview", "inbox"],
  ])("%s %s needs scope %j", (method, path, scope) => {
    expect(find(method, path).scope).toEqual(scope)
  })
})

describe("settings", () => {
  test("anyone allowed to read settings gets the resource, with no admin check", async () => {
    mocks.toSettingsResource.mockResolvedValue({ enabled: true })

    const result = await find("GET", "/v1/translation/settings").handler({
      context: { workspace, member: { role: "agent", permissions: {} } },
    })

    expect(result).toEqual({ enabled: true })
    expect(mocks.toSettingsResource).toHaveBeenCalledWith("ws-1")
  })

  test.each([
    ["PUT", "/v1/translation/settings"],
    ["POST", "/v1/translation/settings/test"],
  ])("%s %s is refused for a member who is not an admin", async (method, path) => {
    await expect(
      find(method, path).handler({
        context: {
          workspace,
          member: { role: "agent", permissions: { superAdmin: false } },
        },
        input: { enabled: false, modelConfig: null },
      }),
    ).rejects.toMatchObject({
      httpStatusCode: 403,
      message: "You need to be a workspace super admin to do this.",
    })

    expect(mocks.updateSettings).not.toHaveBeenCalled()
    expect(mocks.testSettings).not.toHaveBeenCalled()
  })

  test.each([
    ["a workspace token (no member)", undefined],
    ["an owner", { role: "owner", permissions: {} }],
    ["a super admin", { role: "agent", permissions: { superAdmin: true } }],
  ])("update is allowed for %s", async (_name, member) => {
    mocks.updateSettings.mockResolvedValue({ enabled: false })
    const input = { enabled: false, modelConfig: null }

    await find("PUT", "/v1/translation/settings").handler({
      context: { workspace, member },
      input,
    })

    expect(mocks.updateSettings).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      request: input,
    })
  })
})

describe("conversation operations", () => {
  test.each([
    ["GET", "/v1/conversations/{conversationId}/translation", mocks.getState],
    [
      "PUT",
      "/v1/conversations/{conversationId}/translation",
      mocks.updateState,
    ],
    [
      "POST",
      "/v1/conversations/{conversationId}/translation/requests",
      mocks.request,
    ],
    [
      "POST",
      "/v1/conversations/{conversationId}/translation/preview",
      mocks.preview,
    ],
  ])("%s %s proves access to the conversation before doing anything", async (method, path, lib) => {
    const context = { workspace }

    await find(method, path).handler({
      context,
      input: {
        conversationId: "conv-1",
        language: "es",
        text: "hola",
        messages: [{ id: "m1", createdAt: new Date() }],
      },
    })

    expect(mocks.assertAccess).toHaveBeenCalledWith(context, "conv-1")
    expect(lib).toHaveBeenCalledTimes(1)
    expect(mocks.assertAccess.mock.invocationCallOrder[0]).toBeLessThan(
      lib.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("a conversation the caller may not see stops the operation", async () => {
    mocks.assertAccess.mockRejectedValue(new Error("Conversation not found"))

    await expect(
      find(
        "POST",
        "/v1/conversations/{conversationId}/translation/requests",
      ).handler({
        context: { workspace },
        input: { conversationId: "conv-1", messages: [] },
      }),
    ).rejects.toThrow("Conversation not found")
    expect(mocks.request).not.toHaveBeenCalled()
  })

  test("requestMessages passes the body without the path param", async () => {
    const messages = [{ id: "m1", createdAt: new Date("2026-11-19") }]

    await find(
      "POST",
      "/v1/conversations/{conversationId}/translation/requests",
    ).handler({
      context: { workspace },
      input: { conversationId: "conv-1", messages, retryFailed: true },
    })

    expect(mocks.request).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      request: { messages, retryFailed: true },
    })
  })
})
