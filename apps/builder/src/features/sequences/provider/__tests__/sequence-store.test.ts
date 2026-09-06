import { ORPCError } from "@orpc/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listSequencesWorkspaceAuthAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    sequencesAPI: {
      listSequencesWorkspaceAuthAPI: mocks.listSequencesWorkspaceAuthAPI,
    },
  },
}))

const { createSequenceStore } = await import("../sequence-store")

beforeEach(() => {
  mocks.listSequencesWorkspaceAuthAPI.mockReset()
})

describe("getAllActiveSequences", () => {
  test("fetches active sequences for the given workspaceId with maxPerPage", async () => {
    mocks.listSequencesWorkspaceAuthAPI.mockResolvedValueOnce({
      data: [{ id: "1", name: "Welcome" }],
    })

    const store = createSequenceStore()

    await store.getState().getAllActiveSequences("workspace-1")

    expect(mocks.listSequencesWorkspaceAuthAPI).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      perPage: 999_999_999,
      active: true,
    })
    expect(store.getState().sequences).toEqual([{ id: "1", name: "Welcome" }])
  })
})

describe("initialize", () => {
  test("fetches active sequences and marks the store initialized on success", async () => {
    mocks.listSequencesWorkspaceAuthAPI.mockResolvedValueOnce({
      data: [{ id: "1", name: "Welcome" }],
    })

    const store = createSequenceStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(mocks.listSequencesWorkspaceAuthAPI).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
    expect(store.getState().sequences).toEqual([{ id: "1", name: "Welcome" }])
    expect(store.getState().initialized).toBe(true)
    expect(store.getState().loading).toBe(false)
    expect(store.getState().error).toBeNull()
  })

  test("does not fetch again once already initialized", async () => {
    mocks.listSequencesWorkspaceAuthAPI.mockResolvedValue({ data: [] })

    const store = createSequenceStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(mocks.listSequencesWorkspaceAuthAPI).toHaveBeenCalledTimes(1)
  })

  test("sets error and leaves initialized false on a rejected request", async () => {
    mocks.listSequencesWorkspaceAuthAPI.mockRejectedValueOnce(
      new ORPCError("INTERNAL_SERVER_ERROR", { message: "HTTP 500" }),
    )

    const store = createSequenceStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(store.getState().error).toBe("HTTP 500")
    expect(store.getState().initialized).toBe(false)
    expect(store.getState().loading).toBe(false)
  })

  test("falls back to a generic message for a non-ORPCError rejection", async () => {
    mocks.listSequencesWorkspaceAuthAPI.mockRejectedValueOnce(
      new Error("network down"),
    )

    const store = createSequenceStore({ workspaceId: "workspace-1" })

    await store.getState().initialize()

    expect(store.getState().error).toBe("Failed to fetch sequences")
  })
})
