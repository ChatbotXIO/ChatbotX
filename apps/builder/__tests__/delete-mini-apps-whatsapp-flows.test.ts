// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findByIdForWorkspace,
  markRemovedOnMeta,
  listForMiniApps,
  deleteMany,
  runAction,
} = vi.hoisted(() => ({
  findByIdForWorkspace: vi.fn(),
  markRemovedOnMeta: vi.fn(),
  listForMiniApps: vi.fn(),
  deleteMany: vi.fn(),
  runAction: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: { findByIdForWorkspace },
  whatsappFlowService: { markRemovedOnMeta },
}))
vi.mock("@chatbotx.io/business/mini-app", () => ({
  miniAppPublicationService: { listForMiniApps },
  miniAppService: { deleteMany },
}))
vi.mock(
  "@/features/integration-whatsapp/flows/lib/whatsapp-flow-operations",
  () => ({ buildWhatsappContext: vi.fn().mockResolvedValue({ ctx: true }) }),
)
vi.mock("@/integration", () => ({ integrations: { whatsapp: { runAction } } }))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn() } }))

const { deleteMiniApps } = await import(
  "../src/features/mini-apps/lib/delete-mini-apps"
)

const publication = (miniAppId: string, sourceId: string) => ({
  miniAppId,
  integrationWhatsappId: "wa-1",
  sourceId,
})

beforeEach(() => {
  vi.clearAllMocks()
  deleteMany.mockResolvedValue(2)
  findByIdForWorkspace.mockResolvedValue({ id: "wa-1" })
  listForMiniApps.mockResolvedValue([
    publication("10", "flow-a"),
    publication("11", "flow-b"),
  ])
})

const deleteWithFlows = () =>
  deleteMiniApps({
    workspaceId: "ws-1",
    ids: ["10", "11"],
    deleteWhatsappFlows: true,
  })

describe("deleteMiniApps", () => {
  test("keeps the WhatsApp Flows unless asked", async () => {
    await expect(
      deleteMiniApps({
        workspaceId: "ws-1",
        ids: ["10"],
        deleteWhatsappFlows: false,
      }),
    ).resolves.toEqual({ deletedCount: 2, whatsappFlows: [] })
    expect(listForMiniApps).not.toHaveBeenCalled()
    expect(runAction).not.toHaveBeenCalled()
  })

  test("reports each Flow and mirrors Meta's status locally", async () => {
    runAction
      .mockResolvedValueOnce({ outcome: "deprecated", status: "DEPRECATED" })
      .mockResolvedValueOnce({ outcome: "deleted", status: null })

    const result = await deleteWithFlows()

    expect(result.whatsappFlows).toEqual([
      {
        miniAppId: "10",
        integrationWhatsappId: "wa-1",
        flowId: "flow-a",
        outcome: "deprecated",
      },
      {
        miniAppId: "11",
        integrationWhatsappId: "wa-1",
        flowId: "flow-b",
        outcome: "deleted",
      },
    ])
    expect(markRemovedOnMeta).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sourceId: "flow-a",
      status: "DEPRECATED",
    })
    expect(markRemovedOnMeta).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sourceId: "flow-b",
      status: null,
    })
  })

  test("a Meta failure is reported, leaves the local copy alone, and does not block the delete", async () => {
    runAction
      .mockRejectedValueOnce(new Error("Error validating access token"))
      .mockResolvedValueOnce({ outcome: "deprecated", status: "DEPRECATED" })

    const result = await deleteWithFlows()

    expect(deleteMany).toHaveBeenCalled()
    expect(result.whatsappFlows[0]).toMatchObject({
      flowId: "flow-a",
      outcome: "failed",
      error: "Error validating access token",
    })
    expect(result.whatsappFlows[1]).toMatchObject({ outcome: "deprecated" })
    expect(markRemovedOnMeta).toHaveBeenCalledTimes(1)
    expect(markRemovedOnMeta).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "flow-a" }),
    )
  })

  test("never touches Meta when deleting the Mini Apps fails", async () => {
    deleteMany.mockRejectedValue(new Error("connection lost"))

    await expect(deleteWithFlows()).rejects.toThrow("connection lost")
    expect(runAction).not.toHaveBeenCalled()
  })

  test("reports Flows of a number that left the workspace as failed", async () => {
    findByIdForWorkspace.mockResolvedValue(undefined)

    const result = await deleteWithFlows()

    expect(runAction).not.toHaveBeenCalled()
    expect(result.whatsappFlows.map((flow) => flow.outcome)).toEqual([
      "failed",
      "failed",
    ])
    expect(findByIdForWorkspace).toHaveBeenCalledTimes(1)
  })

  test("runs at most 5 Meta calls at once", async () => {
    listForMiniApps.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        publication(String(index), `flow-${index}`),
      ),
    )
    let inFlight = 0
    let peak = 0
    runAction.mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
      return { outcome: "deprecated", status: "DEPRECATED" }
    })

    const result = await deleteWithFlows()

    expect(result.whatsappFlows).toHaveLength(12)
    expect(peak).toBe(5)
  })
})
