import { describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ListRulesInput = {
  workspaceId: string
  channel?: "whatsapp" | "facebook"
}

type ProcedureHandler = (args: {
  input: ListRulesInput
}) => Promise<{ data: unknown[] }>

type WorkspaceMapper = (input: ListRulesInput) => string

const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const state: {
      handler?: ProcedureHandler
      middleware?: unknown
      routeConfig?: RouteConfig
      workspaceMapper?: WorkspaceMapper
    } = {}

    const procedure = {
      route: vi.fn((config: RouteConfig) => {
        state.routeConfig = config
        return procedure
      }),
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

    return {
      authorizedAPI: procedure,
      mocks: {
        assertWorkspaceSuperAdmin: vi.fn(),
        listRules: vi.fn(),
        state,
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

vi.mock("@/features/ads/schemas/conversion-rule", () => {
  const passthroughSchema = {}
  return {
    listAdsConversionRulesRequest: passthroughSchema,
    listAdsConversionRulesResponse: passthroughSchema,
  }
})

import { adsAPI } from "@/features/ads/api"

describe("adsAPI", () => {
  test("registers listRules as an authenticated workspace-scoped endpoint", () => {
    expect(adsAPI).toHaveProperty("listRules")
    expect(mocks.state.routeConfig).toEqual({
      method: "GET",
      path: "/workspaces/{workspaceId}/ads/conversion-rules",
      summary: "List Ads conversion rules",
      tags: ["Ads"],
    })
    expect(mocks.state.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(mocks.state.workspaceMapper?.({ workspaceId: "ws-1" })).toBe("ws-1")
  })

  test("rejects non-super-admin members before listing rules", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValueOnce(
      new Error("errors.superAdminRequired"),
    )

    await expect(
      mocks.state.handler?.({
        input: { workspaceId: "ws-1", channel: "whatsapp" },
      }),
    ).rejects.toThrow("errors.superAdminRequired")

    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mocks.listRules).not.toHaveBeenCalled()
  })
})
