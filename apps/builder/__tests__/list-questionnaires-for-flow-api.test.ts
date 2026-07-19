import { describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ListForFlowInput = {
  workspaceId: string
  keyword?: string
}

type ListForFlowResult = {
  id: string
  name: string
}[]

type WorkspaceMapper = (input: ListForFlowInput) => string
type ProcedureHandler = (args: {
  input: ListForFlowInput
}) => Promise<ListForFlowResult>

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
      use: vi.fn((middleware: unknown, mapper: WorkspaceMapper) => {
        state.middleware = middleware
        state.workspaceMapper = mapper
        return procedure
      }),
      output: vi.fn((_schema: unknown) => procedure),
      handler: vi.fn((handler: ProcedureHandler) => {
        state.handler = handler
        return { handler }
      }),
    }

    return {
      authorizedAPI: procedure,
      mocks: {
        listForFlow: vi.fn(),
        state,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({
  authorizedAPI,
}))

vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware,
}))

vi.mock("@chatbotx.io/business", () => ({
  questionnaireService: {
    listForFlow: mocks.listForFlow,
  },
}))

const { questionnairesAuthenticatedAPI } = await import(
  "@/features/questionnaires/api/authenticated"
)

describe("listQuestionnairesForFlowAPI", () => {
  test("registers an authenticated workspace-scoped GET endpoint", () => {
    expect(questionnairesAuthenticatedAPI).toHaveProperty(
      "listQuestionnairesForFlowAPI",
    )
    expect(mocks.state.routeConfig).toEqual({
      method: "GET",
      path: "/workspaces/{workspaceId}/questionnaires/for-flow",
      summary: "List questionnaires for flow",
      tags: ["Questionnaires"],
    })
    expect(mocks.state.middleware).toBe(workspaceAuthorizedMidddleware)
    expect(mocks.state.workspaceMapper?.({ workspaceId: "workspace-1" })).toBe(
      "workspace-1",
    )
    expect(mocks.state.handler).toBeDefined()
  })

  test("calls questionnaireService.listForFlow with validated input", async () => {
    mocks.listForFlow.mockResolvedValueOnce([
      { id: "questionnaire-1", name: "Lead capture" },
    ])

    await expect(
      mocks.state.handler?.({
        input: { workspaceId: "workspace-1", keyword: "lead" },
      }),
    ).resolves.toEqual([{ id: "questionnaire-1", name: "Lead capture" }])

    expect(mocks.listForFlow).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      keyword: "lead",
    })
  })
})
