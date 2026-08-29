import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// messagingAdsConnectionRepository — the per-integration Facebook Ads
// connection backing the messaging-ads boxes (CTWA/CTM/CTID). Mocks `db` at
// the module boundary so workspace+integration scoping is asserted without
// touching a real database.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
    query: {
      messagingAdsConnectionModel: {
        findFirst: mocks.findFirst,
        findMany: mocks.findMany,
      },
    },
  },
  eq: mocks.eq,
}))

vi.mock("../src/schema", () => ({
  messagingAdsConnectionModel: {
    id: "id",
    workspaceId: "workspaceId",
    integrationWhatsappId: "integrationWhatsappId",
    integrationMessengerId: "integrationMessengerId",
    integrationInstagramId: "integrationInstagramId",
  },
}))

const { messagingAdsConnectionRepository } = await import(
  "../src/repositories/messaging-ads-connection/repository"
)

function chain(finalResult: unknown[]) {
  const builder = {
    values: vi.fn(() => builder),
    set: vi.fn(() => builder),
    where: vi.fn(() => builder),
    returning: vi.fn(() => Promise.resolve(finalResult)),
  }
  return builder
}

describe("messagingAdsConnectionRepository.findForIntegration", () => {
  test("scopes the lookup by workspaceId AND the matching integration FK", async () => {
    mocks.findFirst.mockResolvedValue({ id: "conn_1" })

    const result = await messagingAdsConnectionRepository.findForIntegration({
      workspaceId: "ws_1",
      integrationWhatsappId: "iw_1",
    })

    expect(result).toEqual({ id: "conn_1" })
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws_1", integrationWhatsappId: "iw_1" },
    })
  })

  test("does not add a filter for an integration FK that was not supplied", async () => {
    mocks.findFirst.mockResolvedValue(null)

    await messagingAdsConnectionRepository.findForIntegration({
      workspaceId: "ws_1",
      integrationMessengerId: "im_1",
    })

    const whereArg = mocks.findFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>
    }
    expect(whereArg.where).not.toHaveProperty("integrationWhatsappId")
    expect(whereArg.where).not.toHaveProperty("integrationInstagramId")
  })

  test("returns null on a miss instead of undefined", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    const result = await messagingAdsConnectionRepository.findForIntegration({
      workspaceId: "ws_1",
      integrationInstagramId: "ii_1",
    })

    expect(result).toBeNull()
  })
})

describe("messagingAdsConnectionRepository.listForChannel", () => {
  test("scopes by workspaceId AND channel, and only returns active rows", async () => {
    const rows = [{ id: "conn_1" }, { id: "conn_2" }]
    mocks.findMany.mockResolvedValue(rows)

    const result = await messagingAdsConnectionRepository.listForChannel({
      workspaceId: "ws_1",
      channel: "messenger",
    })

    expect(result).toEqual(rows)
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws_1", channel: "messenger", status: "active" },
    })
  })

  test("returns an empty array when no connection exists for the channel", async () => {
    mocks.findMany.mockResolvedValue([])

    const result = await messagingAdsConnectionRepository.listForChannel({
      workspaceId: "ws_1",
      channel: "instagram",
    })

    expect(result).toEqual([])
  })
})

describe("messagingAdsConnectionRepository.create", () => {
  test("inserts with status active and nulls the two unused integration FKs", async () => {
    const row = { id: "conn_1", workspaceId: "ws_1" }
    const builder = chain([row])
    mocks.insert.mockReturnValue(builder)

    const result = await messagingAdsConnectionRepository.create({
      id: "conn_1",
      workspaceId: "ws_1",
      channel: "instagram",
      integrationInstagramId: "ii_1",
      auth: { accessToken: "token" },
    })

    expect(result).toEqual(row)
    expect(builder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn_1",
        workspaceId: "ws_1",
        channel: "instagram",
        integrationInstagramId: "ii_1",
        integrationWhatsappId: null,
        integrationMessengerId: null,
        status: "active",
      }),
    )
  })

  test("throws when the insert returns no row", async () => {
    mocks.insert.mockReturnValue(chain([]))

    await expect(
      messagingAdsConnectionRepository.create({
        id: "conn_1",
        workspaceId: "ws_1",
        channel: "messenger",
        integrationMessengerId: "im_1",
        auth: { accessToken: "token" },
      }),
    ).rejects.toThrow()
  })
})

describe("messagingAdsConnectionRepository.updateAuth", () => {
  test("scopes the update by id AND workspaceId, and resets status to active", async () => {
    const row = { id: "conn_1", status: "active" }
    const builder = chain([row])
    mocks.update.mockReturnValue(builder)

    const result = await messagingAdsConnectionRepository.updateAuth({
      id: "conn_1",
      workspaceId: "ws_1",
      auth: { accessToken: "new-token" },
    })

    expect(result).toEqual(row)
    expect(builder.set).toHaveBeenCalledWith({
      auth: { accessToken: "new-token" },
      status: "active",
    })
    expect(mocks.and).toHaveBeenCalled()
  })

  test("returns null when no row matched (wrong workspace)", async () => {
    mocks.update.mockReturnValue(chain([]))

    const result = await messagingAdsConnectionRepository.updateAuth({
      id: "conn_1",
      workspaceId: "someone-elses-workspace",
      auth: { accessToken: "new-token" },
    })

    expect(result).toBeNull()
  })
})

describe("messagingAdsConnectionRepository.updateStatus", () => {
  test("is a no-op when no connection exists for the integration", async () => {
    mocks.findFirst.mockResolvedValue(null)

    await messagingAdsConnectionRepository.updateStatus({
      workspaceId: "ws_1",
      integrationWhatsappId: "iw_missing",
      status: "invalid",
    })

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("updates the status of the resolved connection", async () => {
    mocks.findFirst.mockResolvedValue({ id: "conn_1" })
    const builder = chain([{ id: "conn_1", status: "invalid" }])
    mocks.update.mockReturnValue(builder)

    await messagingAdsConnectionRepository.updateStatus({
      workspaceId: "ws_1",
      integrationWhatsappId: "iw_1",
      status: "invalid",
    })

    expect(builder.set).toHaveBeenCalledWith({ status: "invalid" })
  })
})

describe("messagingAdsConnectionRepository.remove", () => {
  test("deletes scoped by id AND workspaceId", async () => {
    mocks.delete.mockReturnValue(chain([]))

    await messagingAdsConnectionRepository.remove({
      id: "conn_1",
      workspaceId: "ws_1",
    })

    expect(mocks.and).toHaveBeenCalled()
    expect(mocks.eq).toHaveBeenCalledWith("id", "conn_1")
    expect(mocks.eq).toHaveBeenCalledWith("workspaceId", "ws_1")
  })
})
