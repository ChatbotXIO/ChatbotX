import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockListQuestionnairesForFlowAPI } = vi.hoisted(() => ({
  mockListQuestionnairesForFlowAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    questionnairesAPI: {
      listQuestionnairesForFlowAPI: mockListQuestionnairesForFlowAPI,
    },
  },
}))

const { createQuestionnaireStore } = await import("../questionnaire-store")

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

beforeEach(() => {
  mockListQuestionnairesForFlowAPI.mockReset()
})

describe("questionnaire store", () => {
  test("loads and caches questionnaires for flow", async () => {
    mockListQuestionnairesForFlowAPI.mockResolvedValueOnce([
      { id: "questionnaire-1", name: "Lead capture" },
      { id: "questionnaire-2", name: "Demo request" },
    ])

    const store = createQuestionnaireStore({ workspaceId: "workspace-1" })

    await store.getState().getAllQuestionnairesForFlow()

    expect(mockListQuestionnairesForFlowAPI).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
    expect(store.getState().questionnaires).toEqual([
      { id: "questionnaire-1", name: "Lead capture" },
      { id: "questionnaire-2", name: "Demo request" },
    ])
    expect(store.getState().loading).toBe(false)
    expect(store.getState().error).toBeNull()
  })

  test("does not fetch again after initialize has completed", async () => {
    mockListQuestionnairesForFlowAPI.mockResolvedValue([
      { id: "questionnaire-1", name: "A" },
    ])

    const store = createQuestionnaireStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(mockListQuestionnairesForFlowAPI).toHaveBeenCalledTimes(1)
    expect(store.getState().initialized).toBe(true)
  })

  test("dedupes overlapping initialize calls while loading", async () => {
    const response = deferred<{ id: string; name: string }[]>()
    mockListQuestionnairesForFlowAPI.mockReturnValueOnce(response.promise)

    const store = createQuestionnaireStore({ workspaceId: "workspace-1" })

    const firstLoad = store.getState().initialize()
    const secondLoad = store.getState().initialize()

    expect(mockListQuestionnairesForFlowAPI).toHaveBeenCalledTimes(1)

    response.resolve([{ id: "questionnaire-1", name: "A" }])
    await Promise.all([firstLoad, secondLoad])

    expect(store.getState().questionnaires).toEqual([
      { id: "questionnaire-1", name: "A" },
    ])
  })

  test("stores errors without replacing cached questionnaires", async () => {
    mockListQuestionnairesForFlowAPI.mockRejectedValueOnce(
      new Error("HTTP 500"),
    )

    const store = createQuestionnaireStore({
      workspaceId: "workspace-1",
      questionnaires: [{ id: "questionnaire-1", name: "Existing" }],
    })

    await store.getState().getAllQuestionnairesForFlow()

    expect(store.getState().questionnaires).toEqual([
      { id: "questionnaire-1", name: "Existing" },
    ])
    expect(store.getState().error).toBe("Failed to fetch questionnaires")
    expect(store.getState().loading).toBe(false)
  })
})
