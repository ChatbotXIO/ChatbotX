import { describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ProcedureHandler = (args: {
  input: Record<string, unknown>
}) => Promise<unknown>

type WorkspaceMapper = (input: Record<string, unknown>) => string

type EndpointState = {
  routeConfig?: RouteConfig
  middleware?: unknown
  workspaceMapper?: WorkspaceMapper
  handler?: ProcedureHandler
}

// Each `adsAPI` endpoint starts its OWN chain via `authorizedAPI.route(...)`
// — a shared mutable "procedure" singleton (as a naive mock would use) would
// let a later-registered endpoint's `.handler()` silently overwrite an
// earlier one's captured state. `route()` here opens a fresh chain/state per
// call, keyed by path, so every endpoint's captured config survives the
// whole module evaluating `adsAPI`.
const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const endpoints = new Map<string, EndpointState>()

    function makeProcedure(state: EndpointState) {
      const procedure = {
        input: vi.fn(() => procedure),
        use: vi.fn((middleware: unknown, mapper: WorkspaceMapper) => {
          state.middleware = middleware
          state.workspaceMapper = mapper
          return procedure
        }),
        output: vi.fn(() => procedure),
        handler: vi.fn((handler: ProcedureHandler) => {
          state.handler = handler
          return { handler }
        }),
      }
      return procedure
    }

    const authorizedAPIMock = {
      route: vi.fn((config: RouteConfig) => {
        const state: EndpointState = { routeConfig: config }
        endpoints.set(config.path, state)
        return makeProcedure(state)
      }),
    }

    return {
      authorizedAPI: authorizedAPIMock,
      mocks: {
        assertWorkspaceSuperAdmin: vi.fn(),
        listRules: vi.fn(),
        resolveChannelAdAccountSources: vi.fn(),
        endpoints,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({ authorizedAPI }))

vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware,
}))

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    list: mocks.listRules,
  },
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  facebookAdAccountSchema: {},
}))

vi.mock("../src/features/ads/queries/channel-ad-accounts", () => ({
  resolveChannelAdAccountSources: mocks.resolveChannelAdAccountSources,
}))

vi.mock("@/features/ads/schemas/conversion-rule", () => {
  const passthroughSchema = {}
  return {
    listAdsConversionRulesRequest: passthroughSchema,
    listAdsConversionRulesResponse: passthroughSchema,
  }
})

vi.mock("@/features/ads/schemas/channel-ad-accounts", () => {
  const passthroughSchema = {}
  return {
    listChannelAdAccountsRequest: passthroughSchema,
  }
})

import { adsAPI } from "@/features/ads/api"

const listRulesPath = "/workspaces/{workspaceId}/ads/conversion-rules"
const listChannelAdAccountsPath =
  "/workspaces/{workspaceId}/ads/{channel}/ad-accounts"

describe("adsAPI.listRules", () => {
  test("registers listRules as an authenticated workspace-scoped endpoint", () => {
    expect(adsAPI).toHaveProperty("listRules")
    const state = mocks.endpoints.get(listRulesPath)
    expect(state?.routeConfig).toEqual({
      method: "GET",
      path: listRulesPath,
      summary: "List Ads conversion rules",
      tags: ["Ads"],
    })
    expect(state?.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(state?.workspaceMapper?.({ workspaceId: "ws-1" })).toBe("ws-1")
  })

  test("rejects non-super-admin members before listing rules", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValueOnce(
      new Error("errors.superAdminRequired"),
    )

    const state = mocks.endpoints.get(listRulesPath)
    await expect(
      state?.handler?.({
        input: { workspaceId: "ws-1", channel: "whatsapp" },
      }),
    ).rejects.toThrow("errors.superAdminRequired")

    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mocks.listRules).not.toHaveBeenCalled()
  })
})

describe("adsAPI.listChannelAdAccounts", () => {
  test("registers as a super-admin-guarded workspace-scoped endpoint", () => {
    expect(adsAPI).toHaveProperty("listChannelAdAccounts")
    const state = mocks.endpoints.get(listChannelAdAccountsPath)
    expect(state?.routeConfig?.method).toBe("GET")
    expect(state?.routeConfig?.path).toBe(listChannelAdAccountsPath)
    expect(state?.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(state?.workspaceMapper?.({ workspaceId: "ws-1" })).toBe("ws-1")
  })

  test("rejects non-super-admin members before resolving accounts", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValueOnce(
      new Error("errors.superAdminRequired"),
    )

    const state = mocks.endpoints.get(listChannelAdAccountsPath)
    await expect(
      state?.handler?.({
        input: { workspaceId: "ws-1", channel: "messenger" },
      }),
    ).rejects.toThrow("errors.superAdminRequired")

    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mocks.resolveChannelAdAccountSources).not.toHaveBeenCalled()
  })

  test("strips internal `sources` provenance from the response", async () => {
    mocks.assertWorkspaceSuperAdmin.mockResolvedValueOnce(undefined)
    mocks.resolveChannelAdAccountSources.mockResolvedValueOnce([
      {
        id: "act_1",
        name: "One",
        sources: [{ kind: "messaging", integrationId: "im-1" }],
      },
      { id: "act_2", name: "Two", sources: [{ kind: "workspace" }] },
    ])

    const state = mocks.endpoints.get(listChannelAdAccountsPath)
    const result = await state?.handler?.({
      input: { workspaceId: "ws-1", channel: "messenger" },
    })

    expect(mocks.resolveChannelAdAccountSources).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
    })
    expect(result).toEqual({
      data: [
        { id: "act_1", name: "One" },
        { id: "act_2", name: "Two" },
      ],
    })
  })
})
