import { ORPCError } from "@orpc/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAllInboxesAuthenticatedAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    inboxesAPI: {
      listAllInboxesAuthenticatedAPI: mocks.listAllInboxesAuthenticatedAPI,
    },
  },
}))

const { createInboxStore } = await import("../inbox-store")

beforeEach(() => {
  mocks.listAllInboxesAuthenticatedAPI.mockReset()
})

describe("getAllInboxes", () => {
  test("fetches every inbox for the workspace with integrations, unpaginated", async () => {
    mocks.listAllInboxesAuthenticatedAPI.mockResolvedValueOnce({
      data: [{ id: "inbox-1", name: "Support" }],
    })

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().getAllInboxes()

    expect(mocks.listAllInboxesAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      includes: ["integration"],
    })
    expect(store.getState().inboxes).toEqual([
      { id: "inbox-1", name: "Support" },
    ])
  })

  test("is a no-op when workspaceId is empty", async () => {
    const store = createInboxStore({ workspaceId: "" })

    await store.getState().getAllInboxes()

    expect(mocks.listAllInboxesAuthenticatedAPI).not.toHaveBeenCalled()
  })

  test("is a no-op while a fetch is already in flight", async () => {
    let resolveFetch!: (value: { data: unknown[] }) => void
    const pending = new Promise<{ data: unknown[] }>((resolve) => {
      resolveFetch = resolve
    })
    mocks.listAllInboxesAuthenticatedAPI.mockReturnValueOnce(pending)

    const store = createInboxStore({ workspaceId: "workspace-1" })

    const first = store.getState().getAllInboxes()
    await store.getState().getAllInboxes()

    expect(mocks.listAllInboxesAuthenticatedAPI).toHaveBeenCalledTimes(1)

    resolveFetch({ data: [] })
    await first
  })

  test("sets the ORPCError message on a rejected request", async () => {
    mocks.listAllInboxesAuthenticatedAPI.mockRejectedValueOnce(
      new ORPCError("INTERNAL_SERVER_ERROR", { message: "HTTP 500" }),
    )

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().getAllInboxes()

    expect(store.getState().error).toBe("HTTP 500")
    expect(store.getState().loadingInboxes).toBe(false)
  })

  test("falls back to a generic message for a non-ORPCError rejection", async () => {
    mocks.listAllInboxesAuthenticatedAPI.mockRejectedValueOnce(
      new Error("network down"),
    )

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().getAllInboxes()

    expect(store.getState().error).toBe("Failed to fetch inboxes")
  })
})

describe("initialize", () => {
  test("calls getAllInboxes once and marks the store initialized", async () => {
    mocks.listAllInboxesAuthenticatedAPI.mockResolvedValueOnce({
      data: [{ id: "inbox-1", name: "Support" }],
    })

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(mocks.listAllInboxesAuthenticatedAPI).toHaveBeenCalledTimes(1)
    expect(store.getState().inboxes).toEqual([
      { id: "inbox-1", name: "Support" },
    ])
    expect(store.getState().initialized).toBe(true)
  })

  test("does not fetch again once already initialized", async () => {
    mocks.listAllInboxesAuthenticatedAPI.mockResolvedValue({ data: [] })

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(mocks.listAllInboxesAuthenticatedAPI).toHaveBeenCalledTimes(1)
  })

  test("still marks the store initialized when getAllInboxes fails", async () => {
    // getAllInboxes catches its own rejection and sets `error` without
    // rethrowing, so initialize's own try/catch never actually observes this
    // failure directly — but its `finally` unconditionally marks
    // `initialized: true` regardless, and getAllInboxes's error is still
    // visible on the shared `error` field.
    mocks.listAllInboxesAuthenticatedAPI.mockRejectedValueOnce(
      new ORPCError("INTERNAL_SERVER_ERROR", { message: "HTTP 500" }),
    )

    const store = createInboxStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(store.getState().initialized).toBe(true)
    expect(store.getState().error).toBe("HTTP 500")
  })
})
