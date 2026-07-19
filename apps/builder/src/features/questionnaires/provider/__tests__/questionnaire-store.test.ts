import { beforeEach, describe, expect, test, vi } from "vitest"

const { MockHTTPError, mockKyGet } = vi.hoisted(() => {
  class MockHTTPError extends Error {
    constructor(message = "HTTP error") {
      super(message)
    }
  }

  return {
    MockHTTPError,
    mockKyGet: vi.fn(),
  }
})

vi.mock("ky", () => ({
  default: {
    get: mockKyGet,
  },
  HTTPError: MockHTTPError,
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
  mockKyGet.mockReset()
})

describe("questionnaire store", () => {
  test("loads and caches questionnaires for flow", async () => {
    mockKyGet.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue([
        { id: "questionnaire-1", name: "Lead capture" },
        { id: "questionnaire-2", name: "Demo request" },
      ]),
    })

    const store = createQuestionnaireStore({ workspaceId: "workspace-1" })

    await store.getState().getAllQuestionnairesForFlow()

    expect(mockKyGet).toHaveBeenCalledWith(
      "/api/workspaces/workspace-1/questionnaires/for-flow",
    )
    expect(store.getState().questionnaires).toEqual([
      { id: "questionnaire-1", name: "Lead capture" },
      { id: "questionnaire-2", name: "Demo request" },
    ])
    expect(store.getState().loading).toBe(false)
    expect(store.getState().error).toBeNull()
  })

  test("does not fetch again after initialize has completed", async () => {
    mockKyGet.mockReturnValue({
      json: vi.fn().mockResolvedValue([{ id: "questionnaire-1", name: "A" }]),
    })

    const store = createQuestionnaireStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(mockKyGet).toHaveBeenCalledTimes(1)
    expect(store.getState().initialized).toBe(true)
  })

  test("dedupes overlapping initialize calls while loading", async () => {
    const response = deferred<{ id: string; name: string }[]>()
    mockKyGet.mockReturnValueOnce({
      json: vi.fn().mockReturnValue(response.promise),
    })

    const store = createQuestionnaireStore({ workspaceId: "workspace-1" })

    const firstLoad = store.getState().initialize()
    const secondLoad = store.getState().initialize()

    expect(mockKyGet).toHaveBeenCalledTimes(1)

    response.resolve([{ id: "questionnaire-1", name: "A" }])
    await Promise.all([firstLoad, secondLoad])

    expect(store.getState().questionnaires).toEqual([
      { id: "questionnaire-1", name: "A" },
    ])
  })

  test("stores HTTP errors without replacing cached questionnaires", async () => {
    mockKyGet.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(new MockHTTPError("HTTP 500")),
    })

    const store = createQuestionnaireStore({
      workspaceId: "workspace-1",
      questionnaires: [{ id: "questionnaire-1", name: "Existing" }],
    })

    await store.getState().getAllQuestionnairesForFlow()

    expect(store.getState().questionnaires).toEqual([
      { id: "questionnaire-1", name: "Existing" },
    ])
    expect(store.getState().error).toBe("HTTP 500")
    expect(store.getState().loading).toBe(false)
  })
})
