import { describe, expect, test, vi } from "vitest"
import { reconcileFreeswitchNode } from "../src/freeswitch/reconciliation"

type Row = {
  id: string
  status: "ringing" | "accepted" | "completed" | "failed" | "rejected"
  freeswitchUuid: string | null
}

const row = (overrides: Partial<Row>): Row => ({
  id: "call-1",
  status: "ringing",
  freeswitchUuid: "uuid-1",
  ...overrides,
})

describe("reconcileFreeswitchNode", () => {
  test("accepted row whose channel is gone -> finalized completed", async () => {
    const finalizeById = vi.fn().mockResolvedValue(undefined)
    const result = await reconcileFreeswitchNode(
      { integrationIds: ["iw-1"] },
      {
        listLiveUuids: async () => new Set<string>(),
        listActiveByIntegrationIds: async () =>
          [
            row({ id: "call-1", status: "accepted", freeswitchUuid: "uuid-1" }),
          ] as never,
        finalizeById,
      },
    )

    expect(result.finalized).toBe(1)
    expect(finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "call-1",
        status: "completed",
        lastError: "reconciled-after-esl-gap",
      }),
    )
  })

  test("ringing row whose channel is gone -> finalized failed", async () => {
    const finalizeById = vi.fn().mockResolvedValue(undefined)
    const result = await reconcileFreeswitchNode(
      { integrationIds: ["iw-1"] },
      {
        listLiveUuids: async () => new Set<string>(),
        listActiveByIntegrationIds: async () =>
          [row({ status: "ringing" })] as never,
        finalizeById,
      },
    )

    expect(result.finalized).toBe(1)
    expect(finalizeById).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    )
  })

  test("a row with a live uuid is left alone", async () => {
    const finalizeById = vi.fn()
    const result = await reconcileFreeswitchNode(
      { integrationIds: ["iw-1"] },
      {
        listLiveUuids: async () => new Set(["uuid-1"]),
        listActiveByIntegrationIds: async () => [row({})] as never,
        finalizeById,
      },
    )

    expect(result.finalized).toBe(0)
    expect(finalizeById).not.toHaveBeenCalled()
  })

  test("a row with a null uuid is skipped (covered by the sweeper, not this loop)", async () => {
    const finalizeById = vi.fn()
    const result = await reconcileFreeswitchNode(
      { integrationIds: ["iw-1"] },
      {
        listLiveUuids: async () => new Set<string>(),
        listActiveByIntegrationIds: async () =>
          [row({ freeswitchUuid: null })] as never,
        finalizeById,
      },
    )

    expect(result.finalized).toBe(0)
    expect(finalizeById).not.toHaveBeenCalled()
  })

  test("emitEnded failures are swallowed and never block finalizing", async () => {
    const finalizeById = vi.fn().mockResolvedValue(undefined)
    const emitEnded = vi.fn().mockRejectedValue(new Error("realtime down"))

    const result = await reconcileFreeswitchNode(
      { integrationIds: ["iw-1"] },
      {
        listLiveUuids: async () => new Set<string>(),
        listActiveByIntegrationIds: async () => [row({})] as never,
        finalizeById,
        emitEnded,
      },
    )

    expect(result.finalized).toBe(1)
    expect(emitEnded).toHaveBeenCalled()
  })
})
