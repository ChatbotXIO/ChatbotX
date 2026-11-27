import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type OptionsInput = { workspaceId: string }
type WorkspaceMapper = (input: OptionsInput) => string
type ProcedureHandler = (args: { input: OptionsInput }) => Promise<unknown>

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
      input: vi.fn((_schema: unknown) => procedure),
      output: vi.fn((_schema: unknown) => procedure),
      use: vi.fn((middleware: unknown, mapper: WorkspaceMapper) => {
        state.middleware = middleware
        state.workspaceMapper = mapper
        return procedure
      }),
      handler: vi.fn((handler: ProcedureHandler) => {
        state.handler = handler
        return { handler }
      }),
    }

    return {
      authorizedAPI: procedure,
      mocks: { listCategories: vi.fn(), state },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({ authorizedAPI }))

vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))

vi.mock("@chatbotx.io/business", () => ({
  placeCategoryService: { list: mocks.listCategories },
}))

const { placesNearMeAuthenticatedAPI } = await import(
  "@/features/places-near-me/api/private"
)

describe("listPlaceCategoryOptionsAPI", () => {
  beforeEach(() => {
    mocks.listCategories.mockReset()
  })

  test("registers an authenticated workspace-scoped GET endpoint", () => {
    expect(placesNearMeAuthenticatedAPI).toHaveProperty(
      "listPlaceCategoryOptionsAPI",
    )
    expect(mocks.state.routeConfig).toMatchObject({
      method: "GET",
      path: "/workspaces/{workspaceId}/places-near-me/category-options",
    })
    expect(mocks.state.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(mocks.state.workspaceMapper?.({ workspaceId: "ws-1" })).toBe("ws-1")
  })

  test("returns id and name in service order", async () => {
    mocks.listCategories.mockResolvedValue([
      { id: "2", name: "Stores", rank: 1, locationCount: 3 },
      { id: "1", name: "Kiosks", rank: 2, locationCount: 0 },
    ])

    const result = await mocks.state.handler?.({
      input: { workspaceId: "ws-1" },
    })

    expect(mocks.listCategories).toHaveBeenCalledWith("ws-1")
    expect(result).toEqual({
      data: [
        { id: "2", name: "Stores" },
        { id: "1", name: "Kiosks" },
      ],
    })
  })
})
