import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }

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

const updateMessenger = vi.fn()
vi.mock(
  "@/features/integration-messenger/lib/update-messenger-settings",
  () => ({
    updateMessenger,
  }),
)
const findIntegrationMessenger = vi.fn()
vi.mock("@/features/integration-messenger/queries", () => ({
  findIntegrationMessenger,
}))
const updateInstagram = vi.fn()
vi.mock(
  "@/features/integration-instagram/lib/update-instagram-settings",
  () => ({
    updateInstagram,
  }),
)
const findIntegrationInstagram = vi.fn()
vi.mock("@/features/integration-instagram/queries", () => ({
  findIntegrationInstagram,
}))

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
