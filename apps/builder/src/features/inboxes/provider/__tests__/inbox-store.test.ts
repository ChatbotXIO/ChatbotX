import { ORPCError } from "@orpc/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listInboxesAuthenticatedAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    inboxesAPI: {
      listInboxesAuthenticatedAPI: mocks.listInboxesAuthenticatedAPI,
    },
  },
}))

const { createInboxStore } = await import("../inbox-store")

beforeEach(() => {
  mocks.listInboxesAuthenticatedAPI.mockReset()
})

describe("getAllInboxes", () => {
  test("fetches inboxes for the workspace with includes and maxPerPage", async () => {
    mocks.listInboxesAuthenticatedAPI.mockResolvedValueOnce({
      data: [{ id: "inbox-1", name: "Support" }],
    })

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().getAllInboxes()

    expect(mocks.listInboxesAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      includes: ["integration"],
      perPage: 999_999_999,
    })
    expect(store.getState().inboxes).toEqual([
      { id: "inbox-1", name: "Support" },
    ])
  })

  test("is a no-op when workspaceId is empty", async () => {
    const store = createInboxStore({ workspaceId: "" })

    await store.getState().getAllInboxes()

    expect(mocks.listInboxesAuthenticatedAPI).not.toHaveBeenCalled()
  })

  test("is a no-op while a fetch is already in flight", async () => {
    let resolveFetch!: (value: { data: unknown[] }) => void
    const pending = new Promise<{ data: unknown[] }>((resolve) => {
      resolveFetch = resolve
    })
    mocks.listInboxesAuthenticatedAPI.mockReturnValueOnce(pending)

    const store = createInboxStore({ workspaceId: "workspace-1" })

    const first = store.getState().getAllInboxes()
    await store.getState().getAllInboxes()

    expect(mocks.listInboxesAuthenticatedAPI).toHaveBeenCalledTimes(1)

    resolveFetch({ data: [] })
    await first
  })

  test("sets the ORPCError message on a rejected request", async () => {
    mocks.listInboxesAuthenticatedAPI.mockRejectedValueOnce(
      new ORPCError("INTERNAL_SERVER_ERROR", { message: "HTTP 500" }),
    )

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().getAllInboxes()

    expect(store.getState().error).toBe("HTTP 500")
    expect(store.getState().loadingInboxes).toBe(false)
  })

  test("falls back to a generic message for a non-ORPCError rejection", async () => {
    mocks.listInboxesAuthenticatedAPI.mockRejectedValueOnce(
      new Error("network down"),
    )

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().getAllInboxes()

    expect(store.getState().error).toBe("Failed to fetch inboxes")
  })
})

describe("initialize", () => {
  test("calls getAllInboxes once and marks the store initialized", async () => {
    mocks.listInboxesAuthenticatedAPI.mockResolvedValueOnce({
      data: [{ id: "inbox-1", name: "Support" }],
    })

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(mocks.listInboxesAuthenticatedAPI).toHaveBeenCalledTimes(1)
    expect(store.getState().inboxes).toEqual([
      { id: "inbox-1", name: "Support" },
    ])
    expect(store.getState().initialized).toBe(true)
  })

  test("does not fetch again once already initialized", async () => {
    mocks.listInboxesAuthenticatedAPI.mockResolvedValue({ data: [] })

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(mocks.listInboxesAuthenticatedAPI).toHaveBeenCalledTimes(1)
  })

  test("still marks the store initialized when getAllInboxes fails", async () => {
    // getAllInboxes catches its own rejection and sets `error` without
    // rethrowing, so initialize's own try/catch never actually observes this
    // failure directly — but its `finally` unconditionally marks
    // `initialized: true` regardless, and getAllInboxes's error is still
    // visible on the shared `error` field.
    mocks.listInboxesAuthenticatedAPI.mockRejectedValueOnce(
      new ORPCError("INTERNAL_SERVER_ERROR", { message: "HTTP 500" }),
    )

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(store.getState().initialized).toBe(true)
    expect(store.getState().error).toBe("HTTP 500")
  })
})
