// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { resolveChannelAdAccountSources } from "../src/features/ads/queries/channel-ad-accounts"

const mocks = vi.hoisted(() => ({
  listCachedMessagingAdAccounts: vi.fn(),
  listForChannel: vi.fn(),
  getCachedAdAccounts: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  listCachedMessagingAdAccounts: mocks.listCachedMessagingAdAccounts,
  messagingAdsConnectionService: {
    listForChannel: mocks.listForChannel,
  },
}))

vi.mock("@/features/integration-facebook-ads/queries", () => ({
  getCachedAdAccounts: mocks.getCachedAdAccounts,
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: mocks.warn },
}))

describe("resolveChannelAdAccountSources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("integrationId given -> narrows to that integration's own connection, tagged with a messaging source", async () => {
    // Ownership guard: the narrowed branch resolves the workspace's ACTIVE
    // connections first and only then touches the shared cache.
    mocks.listForChannel.mockResolvedValue([
      {
        integrationWhatsappId: null,
        integrationMessengerId: "im-1",
        integrationInstagramId: null,
      },
    ])
    mocks.listCachedMessagingAdAccounts.mockResolvedValue([
      { id: "act_1", name: "One" },
    ])

    const result = await resolveChannelAdAccountSources({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "im-1",
    })

    expect(result).toEqual([
      {
        id: "act_1",
        name: "One",
        sources: [{ kind: "messaging", integrationId: "im-1" }],
      },
    ])
    expect(mocks.listForChannel).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
    })
    expect(mocks.getCachedAdAccounts).not.toHaveBeenCalled()
    expect(mocks.listCachedMessagingAdAccounts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "im-1",
    })
  })

  test("a foreign or non-active integrationId NEVER reaches the shared cache (cross-workspace / invalid-connection guard)", async () => {
    // `listCachedMessagingAdAccounts` keys Redis by channel:integrationId
    // only — a warm cache would happily serve another workspace's list. The
    // resolver must reject any integrationId that is not among THIS
    // workspace's active connections (a foreign id and an `invalid`-status
    // connection look identical here: absent from listForChannel).
    mocks.listForChannel.mockResolvedValue([
      {
        integrationWhatsappId: null,
        integrationMessengerId: "im-1",
        integrationInstagramId: null,
      },
    ])

    const result = await resolveChannelAdAccountSources({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "im-foreign",
    })

    expect(result).toEqual([])
    expect(mocks.listCachedMessagingAdAccounts).not.toHaveBeenCalled()
    expect(mocks.getCachedAdAccounts).not.toHaveBeenCalled()
  })

  test("no integrationId -> unions every channel connection plus the workspace-wide fallback, deduped by id", async () => {
    mocks.listForChannel.mockResolvedValue([
      {
        id: "conn_1",
        integrationMessengerId: "im-1",
        integrationWhatsappId: null,
        integrationInstagramId: null,
      },
      {
        id: "conn_2",
        integrationMessengerId: "im-2",
        integrationWhatsappId: null,
        integrationInstagramId: null,
      },
    ])
    mocks.listCachedMessagingAdAccounts.mockImplementation(
      (input: { integrationId: string }) => {
        if (input.integrationId === "im-1") {
          return Promise.resolve([{ id: "act_1", name: "One" }])
        }
        // act_1 is ALSO reachable through im-2 — dedup must merge, not duplicate.
        return Promise.resolve([
          { id: "act_1", name: "One" },
          { id: "act_2", name: "Two" },
        ])
      },
    )
    mocks.getCachedAdAccounts.mockResolvedValue([
      { id: "act_1", name: "One" },
      { id: "act_3", name: "Three (workspace-wide only)" },
    ])

    const result = await resolveChannelAdAccountSources({
      workspaceId: "ws-1",
      channel: "messenger",
    })

    expect(mocks.listForChannel).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
    })
    const byId = new Map(result.map((account) => [account.id, account]))
    expect(byId.get("act_1")?.sources).toEqual([
      { kind: "messaging", integrationId: "im-1" },
      { kind: "messaging", integrationId: "im-2" },
      { kind: "workspace" },
    ])
    expect(byId.get("act_2")?.sources).toEqual([
      { kind: "messaging", integrationId: "im-2" },
    ])
    expect(byId.get("act_3")?.sources).toEqual([{ kind: "workspace" }])
    expect(result).toHaveLength(3)
  })

  test("a connection whose account list fails to load is skipped (warn + skip), never fails the whole union", async () => {
    mocks.listForChannel.mockResolvedValue([
      {
        id: "conn_1",
        integrationMessengerId: "im-1",
        integrationWhatsappId: null,
        integrationInstagramId: null,
      },
      {
        id: "conn_2",
        integrationMessengerId: "im-2",
        integrationWhatsappId: null,
        integrationInstagramId: null,
      },
    ])
    mocks.listCachedMessagingAdAccounts.mockImplementation(
      (input: { integrationId: string }) => {
        if (input.integrationId === "im-1") {
          return Promise.reject(new Error("reconnect needed"))
        }
        return Promise.resolve([{ id: "act_2", name: "Two" }])
      },
    )
    mocks.getCachedAdAccounts.mockRejectedValue(
      new Error("no workspace-wide integration"),
    )

    const result = await resolveChannelAdAccountSources({
      workspaceId: "ws-1",
      channel: "messenger",
    })

    expect(result).toEqual([
      {
        id: "act_2",
        name: "Two",
        sources: [{ kind: "messaging", integrationId: "im-2" }],
      },
    ])
    expect(mocks.warn).toHaveBeenCalled()
  })

  test("the workspace-wide fallback failing (no legacy integration) still returns the messaging-connection accounts", async () => {
    mocks.listForChannel.mockResolvedValue([
      {
        id: "conn_1",
        integrationMessengerId: "im-1",
        integrationWhatsappId: null,
        integrationInstagramId: null,
      },
    ])
    mocks.listCachedMessagingAdAccounts.mockResolvedValue([
      { id: "act_1", name: "One" },
    ])
    mocks.getCachedAdAccounts.mockRejectedValue(
      new Error("no workspace-wide integration"),
    )

    const result = await resolveChannelAdAccountSources({
      workspaceId: "ws-1",
      channel: "messenger",
    })

    expect(result).toEqual([
      {
        id: "act_1",
        name: "One",
        sources: [{ kind: "messaging", integrationId: "im-1" }],
      },
    ])
  })

  test("a channel with no connections at all falls back to the workspace-wide accounts only", async () => {
    mocks.listForChannel.mockResolvedValue([])
    mocks.getCachedAdAccounts.mockResolvedValue([
      { id: "act_1", name: "Legacy" },
    ])

    const result = await resolveChannelAdAccountSources({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })

    expect(result).toEqual([
      { id: "act_1", name: "Legacy", sources: [{ kind: "workspace" }] },
    ])
    expect(mocks.listCachedMessagingAdAccounts).not.toHaveBeenCalled()
  })
})
