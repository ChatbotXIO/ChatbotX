// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// B-M1 (Fable review) — `listOptionsByWorkspaceAndChannel` is a bounded
// id/name projection scoped by BOTH workspace and channel at the query
// level, used by the Calls page's inbox filter select instead of
// `inboxService.listWithIntegrationsByWorkspace` (which eager-loads all nine
// credential-bearing integration relations just to read id/name).
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}))

vi.mock("../src/client", () => ({
  db: {
    query: {
      inboxModel: {
        findMany: mocks.findMany,
      },
    },
  },
}))

const { inboxRepository } = await import("../src/repositories/inbox/repository")

describe("inboxRepository.listOptionsByWorkspaceAndChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMany.mockResolvedValue([
      { id: "inbox-1", name: "Support" },
      { id: "inbox-2", name: "Sales" },
    ])
  })

  test("scopes the query by workspaceId AND channel, selecting only id/name", async () => {
    const result = await inboxRepository.listOptionsByWorkspaceAndChannel({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })

    expect(result).toEqual([
      { id: "inbox-1", name: "Support" },
      { id: "inbox-2", name: "Sales" },
    ])
    expect(mocks.findMany).toHaveBeenCalledWith({
      columns: { id: true, name: true },
      where: { workspaceId: "ws-1", channel: "whatsapp" },
    })
  })

  test("accepts an explicit tx and uses it instead of the default db client", async () => {
    const txFindMany = vi.fn().mockResolvedValue([])
    const tx = { query: { inboxModel: { findMany: txFindMany } } } as never

    await inboxRepository.listOptionsByWorkspaceAndChannel({
      workspaceId: "ws-1",
      channel: "whatsapp",
      tx,
    })

    expect(txFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})
