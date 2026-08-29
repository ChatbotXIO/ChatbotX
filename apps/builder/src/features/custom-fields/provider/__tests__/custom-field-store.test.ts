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

const { createCustomFieldStore } = await import("../custom-field-store")

beforeEach(() => {
  mockKyGet.mockReset()
})

describe("ensureBotFieldsLoaded", () => {
  test("loads bot fields and marks the store initialized on success", async () => {
    mockKyGet.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue({
        data: [{ id: "1", name: "Loyalty Points", type: "number" }],
      }),
    })

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().ensureBotFieldsLoaded()

    expect(mockKyGet).toHaveBeenCalledTimes(1)
    expect(store.getState().botFields).toEqual([
      { id: "1", name: "Loyalty Points", type: "number" },
    ])
    expect(store.getState().botFieldsInitialized).toBe(true)
    expect(store.getState().botFieldsError).toBeNull()
    expect(store.getState().botFieldsLoading).toBe(false)
  })

  test("does not fetch again once already initialized", async () => {
    mockKyGet.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: [] }),
    })

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().ensureBotFieldsLoaded()
    await store.getState().ensureBotFieldsLoaded()

    expect(mockKyGet).toHaveBeenCalledTimes(1)
  })

  test("keeps botFieldsInitialized false on a fetch failure so a later mount retries", async () => {
    mockKyGet.mockReturnValueOnce({
      json: vi.fn().mockRejectedValue(new MockHTTPError("HTTP 500")),
    })

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().ensureBotFieldsLoaded()

    expect(store.getState().botFieldsInitialized).toBe(false)
    expect(store.getState().botFieldsError).toBe("HTTP 500")
    expect(store.getState().botFieldsLoading).toBe(false)

    // A later picker mount must retry instead of being stuck with an empty
    // list forever (the bug: `botFieldsInitialized` was set true even on
    // error, poisoning the dedupe guard).
    mockKyGet.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue({
        data: [{ id: "1", name: "Loyalty Points", type: "number" }],
      }),
    })

    await store.getState().ensureBotFieldsLoaded()

    expect(mockKyGet).toHaveBeenCalledTimes(2)
    expect(store.getState().botFieldsInitialized).toBe(true)
    expect(store.getState().botFields).toEqual([
      { id: "1", name: "Loyalty Points", type: "number" },
    ])
  })

  test("dedupes overlapping in-flight calls even while not yet initialized", async () => {
    let resolveFetch!: (value: { data: unknown[] }) => void
    const pending = new Promise<{ data: unknown[] }>((resolve) => {
      resolveFetch = resolve
    })
    mockKyGet.mockReturnValueOnce({
      json: vi.fn().mockReturnValue(pending),
    })

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    const first = store.getState().ensureBotFieldsLoaded()
    const second = store.getState().ensureBotFieldsLoaded()

    expect(mockKyGet).toHaveBeenCalledTimes(1)

    resolveFetch({ data: [] })
    await Promise.all([first, second])

    expect(store.getState().botFieldsInitialized).toBe(true)
  })
})
