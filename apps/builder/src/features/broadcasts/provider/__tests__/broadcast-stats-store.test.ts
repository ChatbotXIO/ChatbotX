import { ORPCError } from "@orpc/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  privateGetBatchBroadcastStatsAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    broadcastAPIs: {
      privateGetBatchBroadcastStatsAPI: mocks.privateGetBatchBroadcastStatsAPI,
    },
  },
}))

const { createBroadcastStatsStore } = await import("../broadcast-stats-store")

beforeEach(() => {
  mocks.privateGetBatchBroadcastStatsAPI.mockReset()
})

describe("fetchStats", () => {
  test("fetches only the not-yet-fetched broadcast ids", async () => {
    mocks.privateGetBatchBroadcastStatsAPI.mockResolvedValueOnce({
      "b-1": { sent: 10 },
    })

    const store = createBroadcastStatsStore({ workspaceId: "ws-1" })

    await store.getState().fetchStats(["b-1"])

    expect(mocks.privateGetBatchBroadcastStatsAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastIds: ["b-1"],
    })
    expect(store.getState().stats).toEqual({ "b-1": { sent: 10 } })
    expect(store.getState().fetchedBroadcastIds.has("b-1")).toBe(true)
  })

  test("is a no-op when every requested id is already fetched", async () => {
    mocks.privateGetBatchBroadcastStatsAPI.mockResolvedValue({
      "b-1": { sent: 10 },
    })

    const store = createBroadcastStatsStore({ workspaceId: "ws-1" })

    await store.getState().fetchStats(["b-1"])
    await store.getState().fetchStats(["b-1"])

    expect(mocks.privateGetBatchBroadcastStatsAPI).toHaveBeenCalledTimes(1)
  })

  test("only requests the new ids when fetching a mix of fetched and unfetched ids, and merges results", async () => {
    mocks.privateGetBatchBroadcastStatsAPI.mockResolvedValueOnce({
      "b-1": { sent: 10 },
    })

    const store = createBroadcastStatsStore({ workspaceId: "ws-1" })
    await store.getState().fetchStats(["b-1"])

    mocks.privateGetBatchBroadcastStatsAPI.mockResolvedValueOnce({
      "b-2": { sent: 20 },
    })
    await store.getState().fetchStats(["b-1", "b-2"])

    expect(mocks.privateGetBatchBroadcastStatsAPI).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-1",
      broadcastIds: ["b-2"],
    })
    // Merged, not replaced: both entries survive.
    expect(store.getState().stats).toEqual({
      "b-1": { sent: 10 },
      "b-2": { sent: 20 },
    })
    expect(store.getState().fetchedBroadcastIds).toEqual(
      new Set(["b-1", "b-2"]),
    )
  })

  test("sets the ORPCError message on a rejected request and does not mark the ids fetched", async () => {
    mocks.privateGetBatchBroadcastStatsAPI.mockRejectedValueOnce(
      new ORPCError("INTERNAL_SERVER_ERROR", { message: "HTTP 500" }),
    )

    const store = createBroadcastStatsStore({ workspaceId: "ws-1" })

    await store.getState().fetchStats(["b-1"])

    expect(store.getState().error).toBe("HTTP 500")
    expect(store.getState().isLoading).toBe(false)
    // The failed id must not be marked fetched, so a later retry re-fetches it.
    expect(store.getState().fetchedBroadcastIds.has("b-1")).toBe(false)

    mocks.privateGetBatchBroadcastStatsAPI.mockResolvedValueOnce({
      "b-1": { sent: 5 },
    })
    await store.getState().fetchStats(["b-1"])

    expect(mocks.privateGetBatchBroadcastStatsAPI).toHaveBeenCalledTimes(2)
    expect(store.getState().stats).toEqual({ "b-1": { sent: 5 } })
  })

  test("falls back to a generic message for a non-ORPCError rejection", async () => {
    mocks.privateGetBatchBroadcastStatsAPI.mockRejectedValueOnce(
      new Error("network down"),
    )

    const store = createBroadcastStatsStore({ workspaceId: "ws-1" })

    await store.getState().fetchStats(["b-1"])

    expect(store.getState().error).toBe("Failed to fetch stats")
  })
})

describe("reset", () => {
  test("clears stats, error, and fetchedBroadcastIds back to empty", async () => {
    mocks.privateGetBatchBroadcastStatsAPI.mockResolvedValueOnce({
      "b-1": { sent: 10 },
    })

    const store = createBroadcastStatsStore({ workspaceId: "ws-1" })
    await store.getState().fetchStats(["b-1"])
    expect(store.getState().fetchedBroadcastIds.size).toBe(1)

    store.getState().reset()

    expect(store.getState().stats).toEqual({})
    expect(store.getState().error).toBeNull()
    expect(store.getState().isLoading).toBe(false)
    expect(store.getState().fetchedBroadcastIds.size).toBe(0)
  })

  test("resetting one store instance does not affect another instance's already-fetched ids", async () => {
    mocks.privateGetBatchBroadcastStatsAPI.mockResolvedValue({
      "b-1": { sent: 10 },
    })

    const storeA = createBroadcastStatsStore({ workspaceId: "ws-1" })
    const storeB = createBroadcastStatsStore({ workspaceId: "ws-2" })

    await storeA.getState().fetchStats(["b-1"])
    await storeB.getState().fetchStats(["b-1"])

    storeA.getState().reset()

    expect(storeA.getState().fetchedBroadcastIds.size).toBe(0)
    // Guards against the module-level `initialState.fetchedBroadcastIds` Set
    // being shared/mutated across instances instead of each reset producing
    // an independent empty Set.
    expect(storeB.getState().fetchedBroadcastIds.has("b-1")).toBe(true)
  })
})
