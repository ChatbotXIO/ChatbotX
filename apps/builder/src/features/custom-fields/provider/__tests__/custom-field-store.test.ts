import { ORPCError } from "@orpc/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  privateListBotFieldsAPI: vi.fn(),
  privateListCustomFieldsAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    botFieldAPIs: {
      privateListBotFieldsAPI: mocks.privateListBotFieldsAPI,
    },
    customFieldsAPI: {
      privateListCustomFieldsAPI: mocks.privateListCustomFieldsAPI,
    },
  },
}))

const { createCustomFieldStore } = await import("../custom-field-store")

beforeEach(() => {
  mocks.privateListBotFieldsAPI.mockReset()
  mocks.privateListCustomFieldsAPI.mockReset()
})

describe("ensureBotFieldsLoaded", () => {
  test("loads bot fields and marks the store initialized on success", async () => {
    mocks.privateListBotFieldsAPI.mockResolvedValueOnce({
      data: [{ id: "1", name: "Loyalty Points", type: "number" }],
    })

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().ensureBotFieldsLoaded()

    expect(mocks.privateListBotFieldsAPI).toHaveBeenCalledTimes(1)
    expect(store.getState().botFields).toEqual([
      { id: "1", name: "Loyalty Points", type: "number" },
    ])
    expect(store.getState().botFieldsInitialized).toBe(true)
    expect(store.getState().botFieldsError).toBeNull()
    expect(store.getState().botFieldsLoading).toBe(false)
  })

  test("does not fetch again once already initialized", async () => {
    mocks.privateListBotFieldsAPI.mockResolvedValue({ data: [] })

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().ensureBotFieldsLoaded()
    await store.getState().ensureBotFieldsLoaded()

    expect(mocks.privateListBotFieldsAPI).toHaveBeenCalledTimes(1)
  })

  test("keeps botFieldsInitialized false on a fetch failure so a later mount retries", async () => {
    mocks.privateListBotFieldsAPI.mockRejectedValueOnce(
      new ORPCError("INTERNAL_SERVER_ERROR", { message: "HTTP 500" }),
    )

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().ensureBotFieldsLoaded()

    expect(store.getState().botFieldsInitialized).toBe(false)
    expect(store.getState().botFieldsError).toBe("HTTP 500")
    expect(store.getState().botFieldsLoading).toBe(false)

    // A later picker mount must retry instead of being stuck with an empty
    // list forever (the bug: `botFieldsInitialized` was set true even on
    // error, poisoning the dedupe guard).
    mocks.privateListBotFieldsAPI.mockResolvedValueOnce({
      data: [{ id: "1", name: "Loyalty Points", type: "number" }],
    })

    await store.getState().ensureBotFieldsLoaded()

    expect(mocks.privateListBotFieldsAPI).toHaveBeenCalledTimes(2)
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
    mocks.privateListBotFieldsAPI.mockReturnValueOnce(pending)

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    const first = store.getState().ensureBotFieldsLoaded()
    const second = store.getState().ensureBotFieldsLoaded()

    expect(mocks.privateListBotFieldsAPI).toHaveBeenCalledTimes(1)

    resolveFetch({ data: [] })
    await Promise.all([first, second])

    expect(store.getState().botFieldsInitialized).toBe(true)
  })
})

describe("getAllCustomFields", () => {
  test("fetches custom fields for the store's workspaceId with maxPerPage", async () => {
    mocks.privateListCustomFieldsAPI.mockResolvedValueOnce({
      data: [{ id: "1", name: "Loyalty Points" }],
    })

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().getAllCustomFields()

    expect(mocks.privateListCustomFieldsAPI).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      perPage: 999_999_999,
    })
    expect(store.getState().customFields).toEqual([
      { id: "1", name: "Loyalty Points" },
    ])
    expect(store.getState().error).toBeNull()
    expect(store.getState().loading).toBe(false)
  })

  test("is a no-op when workspaceId is empty", async () => {
    const store = createCustomFieldStore({ workspaceId: "" })

    await store.getState().getAllCustomFields()

    expect(mocks.privateListCustomFieldsAPI).not.toHaveBeenCalled()
  })

  test("is a no-op while a fetch is already in flight", async () => {
    let resolveFetch!: (value: { data: unknown[] }) => void
    const pending = new Promise<{ data: unknown[] }>((resolve) => {
      resolveFetch = resolve
    })
    mocks.privateListCustomFieldsAPI.mockReturnValueOnce(pending)

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    const first = store.getState().getAllCustomFields()
    await store.getState().getAllCustomFields()

    expect(mocks.privateListCustomFieldsAPI).toHaveBeenCalledTimes(1)

    resolveFetch({ data: [] })
    await first
  })

  test("sets error on a rejected request", async () => {
    mocks.privateListCustomFieldsAPI.mockRejectedValueOnce(
      new ORPCError("INTERNAL_SERVER_ERROR", { message: "HTTP 500" }),
    )

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().getAllCustomFields()

    expect(store.getState().error).toBe("HTTP 500")
    expect(store.getState().loading).toBe(false)
  })
})

describe("initialize", () => {
  test("calls getAllCustomFields once and marks the store initialized", async () => {
    mocks.privateListCustomFieldsAPI.mockResolvedValueOnce({
      data: [{ id: "1", name: "Loyalty Points" }],
    })

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(mocks.privateListCustomFieldsAPI).toHaveBeenCalledTimes(1)
    expect(store.getState().customFields).toEqual([
      { id: "1", name: "Loyalty Points" },
    ])
    expect(store.getState().initialized).toBe(true)
  })

  test("does not fetch again once already initialized", async () => {
    mocks.privateListCustomFieldsAPI.mockResolvedValue({ data: [] })

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(mocks.privateListCustomFieldsAPI).toHaveBeenCalledTimes(1)
  })

  test("still marks the store initialized when getAllCustomFields fails", async () => {
    mocks.privateListCustomFieldsAPI.mockRejectedValueOnce(
      new ORPCError("INTERNAL_SERVER_ERROR", { message: "HTTP 500" }),
    )

    const store = createCustomFieldStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(store.getState().initialized).toBe(true)
  })
})
