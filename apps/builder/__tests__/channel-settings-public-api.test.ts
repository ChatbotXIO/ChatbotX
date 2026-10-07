import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string; successStatus?: number }

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: unknown[]) => unknown
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: unknown[]) => unknown) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

const tiktokIntegrationService = {
  setCommentToMessage: vi.fn(),
  refreshCommentToMessage: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({
  tiktokIntegrationService,
  messengerIntegrationService: { updateTagSync: vi.fn() },
}))

// The shared channel read/coexist/CAPI route factories are covered by
// channel-integrations-public-api.test.ts; stub them so only this file's
// routes register.
vi.mock("@/features/channel-integrations/api/public", () => ({
  createCapiRoutes: () => ({}),
  createChannelReadRoutes: () => ({}),
  createCoexistRoute: () => ({}),
  createHandoverResumeFlowRoute: () => ({}),
}))

const updateMessenger = vi.fn()
const patchMessengerSettings = vi.fn()
vi.mock(
  "@/features/integration-messenger/lib/update-messenger-settings",
  () => ({
    updateMessenger,
    patchMessengerSettings,
  }),
)
const findIntegrationMessenger = vi.fn()
vi.mock("@/features/integration-messenger/queries", () => ({
  findIntegrationMessenger,
}))
const updateInstagram = vi.fn()
const patchInstagramSettings = vi.fn()
vi.mock(
  "@/features/integration-instagram/lib/update-instagram-settings",
  () => ({
    updateInstagram,
    patchInstagramSettings,
  }),
)
const findIntegrationInstagram = vi.fn()
vi.mock("@/features/integration-instagram/queries", () => ({
  findIntegrationInstagram,
}))

const disconnectMessenger = vi.fn()
vi.mock(
  "@/features/integration-messenger/actions/disconnect-messenger",
  () => ({
    disconnectMessenger,
  }),
)
const disconnectInstagram = vi.fn()
vi.mock(
  "@/features/integration-instagram/actions/disconnect-instagram",
  () => ({
    disconnectInstagram,
  }),
)

await import("@/features/integration-messenger/api/public")
await import("@/features/integration-instagram/api/public")
await import("@/features/integration-tiktok/api/public")

// Captured before the first beforeEach's clearAllMocks() erases them.
const scopesAtImport = workspaceTokenAuthAPIForScope.mock.calls.map(
  ([scope]) => scope,
)

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const context = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

const settings = {
  welcomeFlowId: null,
  persistentMenus: [],
  conversationStarters: [],
}

test("all channel routers register under the channels scope", () => {
  expect(scopesAtImport).toEqual(["channels", "channels", "channels"])
})

describe.each([
  [
    "messenger-channels",
    findIntegrationMessenger,
    updateMessenger,
    { personas: [] },
  ],
  ["instagram-channels", findIntegrationInstagram, updateInstagram, {}],
] as const)("/v1/%s/{id}/settings", (resource, find, update, extra) => {
  const path = `/v1/${resource}/{id}/settings`

  test("GET reads the channel in the token workspace", async () => {
    find.mockResolvedValueOnce({ ...settings, ...extra, auth: { secret: "x" } })

    const result = await findProcedure("GET", path).handler?.({
      context,
      input: { id: "ch-1" },
    })

    expect(find).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "ch-1",
    })
    // The resource is an allowlist: tokens and other columns never leave.
    expect(result).not.toHaveProperty("auth")
  })

  test("PUT saves through the same writer as the builder", async () => {
    await findProcedure("PUT", path).handler?.({
      context,
      input: { id: "ch-1", ...settings, ...extra },
    })

    expect(update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "ch-1" },
      { ...settings, ...extra },
    )
  })
})

describe("PATCH /v1/{messenger,instagram}-channels/{id}/settings", () => {
  test.each([
    ["messenger-channels", patchMessengerSettings],
    ["instagram-channels", patchInstagramSettings],
  ] as const)("%s sends only the given fields to the locked partial writer", async (resource, patch) => {
    await findProcedure("PATCH", `/v1/${resource}/{id}/settings`).handler?.({
      context,
      input: { id: "ch-1", welcomeFlowId: null },
    })

    expect(patch).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "ch-1" },
      expect.objectContaining({ welcomeFlowId: null }),
    )
  })

  test("a Messenger persona needs only a name and a picture URL", async () => {
    await findProcedure(
      "PATCH",
      "/v1/messenger-channels/{id}/settings",
    ).handler?.({
      context,
      input: {
        id: "ch-1",
        personas: [
          {
            name: "Ann",
            profilePictureUrl: "https://x.io/a.png",
            isDefault: true,
          },
        ],
      },
    })

    expect(patchMessengerSettings.mock.calls[0]?.[1].personas).toEqual([
      {
        id: "",
        name: "Ann",
        isDefault: true,
        profilePicture: {
          id: expect.any(String),
          url: "https://x.io/a.png",
          mode: "url",
        },
      },
    ])
  })

  test("PUT also accepts profilePictureUrl personas", async () => {
    await findProcedure(
      "PUT",
      "/v1/messenger-channels/{id}/settings",
    ).handler?.({
      context,
      input: {
        id: "ch-1",
        ...settings,
        personas: [
          {
            id: "p-1",
            name: "Ann",
            profilePictureUrl: "https://x.io/a.png",
            isDefault: false,
          },
        ],
      },
    })

    expect(updateMessenger.mock.calls[0]?.[1].personas[0]).toMatchObject({
      id: "p-1",
      profilePicture: { url: "https://x.io/a.png", mode: "url" },
    })
  })
})

describe("DELETE /v1/{messenger,instagram}-channels/{id}", () => {
  test("Messenger disconnect runs the builder's disconnect in the token workspace", async () => {
    const procedure = findProcedure("DELETE", "/v1/messenger-channels/{id}")
    expect(procedure.route.successStatus).toBe(204)

    await procedure.handler?.({ context, input: { id: "ch-1" } })

    expect(disconnectMessenger).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "ch-1",
    })
  })

  test("Instagram disconnect runs the builder's disconnect in the token workspace", async () => {
    const procedure = findProcedure("DELETE", "/v1/instagram-channels/{id}")
    expect(procedure.route.successStatus).toBe(204)

    await procedure.handler?.({ context, input: { id: "ig-1" } })

    expect(disconnectInstagram).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      integrationInstagramId: "ig-1",
    })
  })
})

describe("/v1/tiktok-channels/{id}/comment-to-message", () => {
  const path = "/v1/tiktok-channels/{id}/comment-to-message"

  test("PATCH toggles through the service", async () => {
    tiktokIntegrationService.setCommentToMessage.mockResolvedValueOnce("ENABLE")

    await expect(
      findProcedure("PATCH", path).handler?.({
        context,
        input: { id: "tt-1", enabled: true },
      }),
    ).resolves.toEqual({ status: "ENABLE" })
    expect(tiktokIntegrationService.setCommentToMessage).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "tt-1",
      enabled: true,
    })
  })

  test("GET re-reads the live state", async () => {
    tiktokIntegrationService.refreshCommentToMessage.mockResolvedValueOnce(null)

    await expect(
      findProcedure("GET", path).handler?.({ context, input: { id: "tt-1" } }),
    ).resolves.toEqual({ status: null })
  })
})
