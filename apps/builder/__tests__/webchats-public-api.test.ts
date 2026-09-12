import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: ProcedureHandler
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
      handler: vi.fn((fn: ProcedureHandler) => {
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

const integrationWebchatService = {
  list: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  createWithWorkspace: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const resolveTenantSettings = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  integrationWebchatService,
  resolveTenantSettings,
}))

const isCommunity = vi.fn(() => false)
vi.mock("@/env", () => ({ isCommunity: () => isCommunity() }))

vi.mock("@chatbotx.io/database/partials", async () => {
  const { z } = await import("zod")
  return {
    webchatConversationStarter: z.object({}),
    webchatPersistentMenu: z.object({}),
  }
})

const { webchatSelectSchema } = vi.hoisted(() => {
  const webchatSelectSchema: {
    pick: ReturnType<typeof vi.fn>
    extend: ReturnType<typeof vi.fn>
    omit: ReturnType<typeof vi.fn>
  } = {
    pick: vi.fn(() => webchatSelectSchema),
    extend: vi.fn(() => webchatSelectSchema),
    omit: vi.fn(() => webchatSelectSchema),
  }
  return { webchatSelectSchema }
})
vi.mock("@chatbotx.io/database/schema", () => ({
  createSelectSchema: vi.fn(() => webchatSelectSchema),
  integrationWebchatModel: {},
}))

await import("@/features/integration-webchat/api/public")
const { updateWebchatPublicRequest } = await import(
  "@/features/integration-webchat/schema/public"
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

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]
const webchatResourceOmitArgAtImport =
  webchatSelectSchema.omit.mock.calls[0]?.[0]
const context = { workspace: { id: "workspace-1", ownerId: "owner-1" } }

beforeEach(() => {
  vi.clearAllMocks()
  isCommunity.mockReturnValue(false)
})

test("registers the webchats public router under the channels scope", () => {
  expect(scopeArgAtImport).toBe("channels")
})

test("webchatPublicResource never exposes workspaceId or the auth credential blob", () => {
  expect(webchatResourceOmitArgAtImport).toEqual({
    workspaceId: true,
    auth: true,
  })
})

describe("POST /v1/webchats", () => {
  const procedure = findProcedure("POST", "/v1/webchats")
  const baseInput = {
    name: "My Webchat",
    persistentMenus: [] as unknown[],
    authorizedDomains: ["example.com"],
    conversationStarters: [] as unknown[],
    brandColor: "#112233",
    hideHeader: false,
    showLogo: true,
    hideMessageInput: false,
    enable: true,
    customCss: undefined,
    welcomeFlowId: undefined,
  }

  test("adds the branding menu entry when isCommunity() is true", async () => {
    isCommunity.mockReturnValue(true)
    resolveTenantSettings.mockResolvedValueOnce({ appUrl: "https://app.test" })
    integrationWebchatService.createWithWorkspace.mockResolvedValueOnce({
      webchatId: "wc-1",
    })
    integrationWebchatService.findByIdForWorkspace.mockResolvedValueOnce({
      id: "wc-1",
    })

    await procedure.handler?.({ context, input: baseInput })

    expect(integrationWebchatService.createWithWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        createdBy: "owner-1",
        data: expect.objectContaining({
          persistentMenus: [
            expect.objectContaining({
              label: "⚡ Built with chatbotx.io",
              type: "url",
            }),
          ],
          authorizedDomains: ["example.com"],
          auth: {},
        }),
      }),
    )
  })

  test("leaves persistentMenus untouched when isCommunity() is false", async () => {
    isCommunity.mockReturnValue(false)
    resolveTenantSettings.mockResolvedValueOnce({ appUrl: "https://app.test" })
    integrationWebchatService.createWithWorkspace.mockResolvedValueOnce({
      webchatId: "wc-1",
    })
    integrationWebchatService.findByIdForWorkspace.mockResolvedValueOnce({
      id: "wc-1",
    })
    const persistentMenus = [
      { label: "Support", type: "url", url: "https://example.com" },
    ]

    await procedure.handler?.({
      context,
      input: { ...baseInput, persistentMenus },
    })

    expect(integrationWebchatService.createWithWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ persistentMenus }),
      }),
    )
  })

  test("reads the created webchat back by the minted id", async () => {
    resolveTenantSettings.mockResolvedValueOnce({ appUrl: "https://app.test" })
    integrationWebchatService.createWithWorkspace.mockResolvedValueOnce({
      webchatId: "wc-1",
    })
    const created = { id: "wc-1" }
    integrationWebchatService.findByIdForWorkspace.mockResolvedValueOnce(
      created,
    )

    await expect(
      procedure.handler?.({ context, input: baseInput }),
    ).resolves.toEqual(created)

    expect(integrationWebchatService.findByIdForWorkspace).toHaveBeenCalledWith(
      { id: "wc-1", workspaceId: "workspace-1" },
    )
  })
})

describe("PUT /v1/webchats/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/webchats/{id}")

  test("re-applies branding when persistentMenus is supplied", async () => {
    isCommunity.mockReturnValue(true)
    integrationWebchatService.findByIdForWorkspace.mockResolvedValue({
      id: "wc-1",
    })
    resolveTenantSettings.mockResolvedValueOnce({ appUrl: "https://app.test" })
    integrationWebchatService.update.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context,
      input: { id: "wc-1", persistentMenus: [] },
    })

    expect(resolveTenantSettings).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
    expect(integrationWebchatService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "wc-1",
      data: expect.objectContaining({
        persistentMenus: [
          expect.objectContaining({ label: "⚡ Built with chatbotx.io" }),
        ],
      }),
    })
  })

  test("skips branding resolution entirely when persistentMenus is absent", async () => {
    integrationWebchatService.findByIdForWorkspace.mockResolvedValue({
      id: "wc-1",
    })
    integrationWebchatService.update.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context,
      input: { id: "wc-1", name: "Renamed" },
    })

    expect(resolveTenantSettings).not.toHaveBeenCalled()
    expect(integrationWebchatService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "wc-1",
      data: { name: "Renamed", persistentMenus: undefined },
    })
  })
})

describe("updateWebchatPublicRequest", () => {
  test("omitting a defaulted boolean field leaves it undefined instead of resetting it to the create-time default", () => {
    const parsed = updateWebchatPublicRequest.parse({ name: "Renamed" })

    expect(parsed.hideHeader).toBeUndefined()
    expect(parsed.showLogo).toBeUndefined()
    expect(parsed.hideMessageInput).toBeUndefined()
    expect(parsed.enable).toBeUndefined()
  })

  test("an explicitly supplied boolean field still parses through", () => {
    const parsed = updateWebchatPublicRequest.parse({
      hideHeader: true,
      showLogo: false,
      hideMessageInput: true,
      enable: false,
    })

    expect(parsed).toMatchObject({
      hideHeader: true,
      showLogo: false,
      hideMessageInput: true,
      enable: false,
    })
  })
})

describe("DELETE /v1/webchats/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/webchats/{id}")

  test("delegates to integrationWebchatService.delete", async () => {
    await procedure.handler?.({ context, input: { id: "wc-1" } })

    expect(integrationWebchatService.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "wc-1",
    })
  })
})
