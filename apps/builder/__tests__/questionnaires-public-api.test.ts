import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedHandler = (args: unknown) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: CapturedHandler
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
      handler: vi.fn((fn: unknown) => {
        // Handlers are captured through the mocked oRPC boundary for behavior tests.
        const capturedHandler = fn as CapturedHandler
        record.handler = capturedHandler
        return { handler: capturedHandler }
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

const questionnaireService = {
  list: vi.fn(),
  getForEdit: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  rename: vi.fn(),
  duplicate: vi.fn(),
}

const questionnaireSubmissionService = {
  list: vi.fn(),
  detail: vi.fn(),
  deleteSubmission: vi.fn(),
  dashboard: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  questionnaireService,
  questionnaireSubmissionService,
}))

await import("@/features/questionnaires/api/public")

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
const context = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the questionnaires public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

test("registers each questionnaire route with its public method and path", () => {
  expect(
    capturedProcedures.map(({ route }) => [route.method, route.path]),
  ).toEqual([
    ["GET", "/v1/questionnaires"],
    ["GET", "/v1/questionnaires/{id}"],
    ["POST", "/v1/questionnaires"],
    ["PUT", "/v1/questionnaires/{id}"],
    ["DELETE", "/v1/questionnaires/{id}"],
    ["PATCH", "/v1/questionnaires/{id}/rename"],
    ["POST", "/v1/questionnaires/{id}/duplicate"],
    ["GET", "/v1/questionnaires/{id}/submissions"],
    ["GET", "/v1/questionnaires/{id}/submissions/{submissionId}"],
    ["DELETE", "/v1/questionnaires/{id}/submissions/{submissionId}"],
    ["GET", "/v1/questionnaires/{id}/submissions/stats"],
  ])
})

describe("questionnaire resource handlers", () => {
  test("lists workspace questionnaires", async () => {
    const procedure = findProcedure("GET", "/v1/questionnaires")
    const response = { data: [{ id: "q-1", name: "Quiz" }], pageCount: 1 }
    questionnaireService.list.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context,
        input: { page: 2, perPage: 20, name: "Quiz", sort: [] },
      }),
    ).resolves.toEqual(response)

    expect(questionnaireService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 20,
      name: "Quiz",
      sort: [],
    })
  })

  test("gets a questionnaire through the workspace-scoped service", async () => {
    const procedure = findProcedure("GET", "/v1/questionnaires/{id}")
    const response = { id: "q-1", questions: [] }
    questionnaireService.getForEdit.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({ context, input: { id: "q-1" } }),
    ).resolves.toEqual(response)

    expect(questionnaireService.getForEdit).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "q-1",
    })
  })

  test("propagates a declared not-found error from get", async () => {
    const procedure = findProcedure("GET", "/v1/questionnaires/{id}")
    questionnaireService.getForEdit.mockRejectedValueOnce(
      new Error("Questionnaire not found"),
    )

    await expect(
      procedure.handler?.({ context, input: { id: "missing" } }),
    ).rejects.toThrow("Questionnaire not found")
  })

  test("creates a questionnaire and returns its id", async () => {
    const procedure = findProcedure("POST", "/v1/questionnaires")
    questionnaireService.create.mockResolvedValueOnce("q-1")

    await expect(
      procedure.handler?.({ context, input: { name: "Quiz" } }),
    ).resolves.toEqual({ id: "q-1" })

    expect(questionnaireService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Quiz",
    })
  })

  test("updates a questionnaire with its id from the route", async () => {
    const procedure = findProcedure("PUT", "/v1/questionnaires/{id}")
    const input = {
      id: "q-1",
      triggerFlowId: null,
      enableScore: true,
      enableRetryMessages: false,
      enableCustomFieldMapping: true,
      questions: [],
    }
    questionnaireService.update.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input }),
    ).resolves.toBeUndefined()

    expect(questionnaireService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ...input,
    })
  })

  test("renames a questionnaire with its id from the route", async () => {
    const procedure = findProcedure("PATCH", "/v1/questionnaires/{id}/rename")
    questionnaireService.rename.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context,
        input: { id: "q-1", name: "Renamed Quiz" },
      }),
    ).resolves.toBeUndefined()

    expect(questionnaireService.rename).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "q-1",
      name: "Renamed Quiz",
    })
  })

  test("deletes one questionnaire through deleteMany", async () => {
    const procedure = findProcedure("DELETE", "/v1/questionnaires/{id}")
    questionnaireService.deleteMany.mockResolvedValueOnce(undefined)

    await procedure.handler?.({ context, input: { id: "q-1" } })

    expect(questionnaireService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["q-1"],
    })
  })

  test("duplicates a questionnaire and returns its id", async () => {
    const procedure = findProcedure("POST", "/v1/questionnaires/{id}/duplicate")
    questionnaireService.duplicate.mockResolvedValueOnce("q-copy")

    await expect(
      procedure.handler?.({ context, input: { id: "q-1" } }),
    ).resolves.toEqual({ id: "q-copy" })

    expect(questionnaireService.duplicate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "q-1",
    })
  })
})

describe("questionnaire submission handlers", () => {
  test("lists submissions under the questionnaire identified by the route", async () => {
    const procedure = findProcedure(
      "GET",
      "/v1/questionnaires/{id}/submissions",
    )
    const response = { enableScore: true, data: [], pageCount: 0 }
    questionnaireSubmissionService.list.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context,
        input: { id: "q-1", page: 1, perPage: 20, name: "Ada", sort: [] },
      }),
    ).resolves.toEqual(response)

    expect(questionnaireSubmissionService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      questionnaireId: "q-1",
      page: 1,
      perPage: 20,
      name: "Ada",
      sort: [],
    })
  })

  test("gets one submission under its questionnaire", async () => {
    const procedure = findProcedure(
      "GET",
      "/v1/questionnaires/{id}/submissions/{submissionId}",
    )
    const response = { id: "s-1", answers: [] }
    questionnaireSubmissionService.detail.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({
        context,
        input: { id: "q-1", submissionId: "s-1" },
      }),
    ).resolves.toEqual(response)

    expect(questionnaireSubmissionService.detail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      questionnaireId: "q-1",
      submissionId: "s-1",
    })
  })

  test("deletes one submission through the single-id service method", async () => {
    const procedure = findProcedure(
      "DELETE",
      "/v1/questionnaires/{id}/submissions/{submissionId}",
    )
    questionnaireSubmissionService.deleteSubmission.mockResolvedValueOnce(
      undefined,
    )

    await procedure.handler?.({
      context,
      input: { id: "q-1", submissionId: "s-1" },
    })

    expect(
      questionnaireSubmissionService.deleteSubmission,
    ).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      questionnaireId: "q-1",
      submissionId: "s-1",
    })
  })

  test("gets submission stats for a questionnaire", async () => {
    const procedure = findProcedure(
      "GET",
      "/v1/questionnaires/{id}/submissions/stats",
    )
    const response = {
      totalApplicants: 10,
      completed: 4,
      completionRate: 40,
    }
    questionnaireSubmissionService.dashboard.mockResolvedValueOnce(response)

    await expect(
      procedure.handler?.({ context, input: { id: "q-1" } }),
    ).resolves.toEqual(response)

    expect(questionnaireSubmissionService.dashboard).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      questionnaireId: "q-1",
    })
  })
})
