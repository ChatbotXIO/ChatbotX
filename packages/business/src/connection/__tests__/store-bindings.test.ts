import { beforeEach, describe, expect, it, vi } from "vitest"
import { CONNECTION_STORE_BINDINGS } from "../store-bindings"

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions) => conditions),
  eq: vi.fn((column, value) => ({ column, value })),
  transaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
  db: { transaction: mocks.transaction },
  eq: mocks.eq,
}))

const makeTx = () => {
  const loadLimit = vi.fn()
  const loadWhere = vi.fn(() => ({ limit: loadLimit }))
  const loadFrom = vi.fn(() => ({ where: loadWhere }))
  const select = vi.fn(() => ({ from: loadFrom }))

  const updateReturning = vi.fn().mockResolvedValue([{ id: "row-1" }])
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const deleteWhere = vi.fn().mockResolvedValue(undefined)
  const remove = vi.fn(() => ({ where: deleteWhere }))

  const insertReturning = vi
    .fn()
    .mockResolvedValueOnce([{ id: "integration-1" }])
    .mockResolvedValueOnce([{ id: "satellite-1" }])
  const insertValues = vi.fn(() => ({ returning: insertReturning }))
  const insert = vi.fn(() => ({ values: insertValues }))

  return {
    tx: { delete: remove, insert, select, update },
    deleteWhere,
    insertValues,
    loadLimit,
    loadWhere,
    select,
    updateSet,
    updateWhere,
  }
}

const auth = { authType: "secretText", secretText: "secret" } as const

const bindingOrThrow = (provider: keyof typeof CONNECTION_STORE_BINDINGS) => {
  const binding = CONNECTION_STORE_BINDINGS[provider]
  if (!binding) {
    throw new Error(`Missing ${provider} store binding`)
  }
  return binding
}

describe("CONNECTION_STORE_BINDINGS", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads, updates, and deletes a channel row by inbox foreign key", async () => {
    const binding = bindingOrThrow("messenger")
    const fixture = makeTx()
    fixture.loadLimit.mockResolvedValue([{ auth }])

    await expect(
      binding.loadAuthByForeignKey("inbox-1", fixture.tx as never),
    ).resolves.toEqual(auth)
    await expect(
      binding.saveAuthByForeignKey(
        "inbox-1",
        auth,
        { ignored: true },
        fixture.tx as never,
      ),
    ).resolves.toBe(true)
    await binding.deleteRowByForeignKey("inbox-1", fixture.tx as never)

    expect(fixture.updateSet).toHaveBeenCalledWith({ auth })
    expect(fixture.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({ value: "inbox-1" }),
    )
    expect(fixture.deleteWhere).toHaveBeenCalledWith(
      expect.objectContaining({ value: "inbox-1" }),
    )
  })

  it("hydrates OpenAI-compatible auth with its persisted base URL", async () => {
    const binding = bindingOrThrow("openaiCompatible")
    const fixture = makeTx()
    fixture.loadLimit.mockResolvedValue([
      { auth, baseURL: "https://provider.example.com/" },
    ])

    await expect(
      binding.loadAuthByForeignKey("integration-1", fixture.tx as never),
    ).resolves.toEqual({
      ...auth,
      baseURL: "https://provider.example.com/",
    })
    expect(fixture.select).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: expect.anything() }),
    )
  })

  it("applies the shared-table discriminator to every Instagram binding query", async () => {
    const binding = bindingOrThrow("instagram")
    const fixture = makeTx()
    fixture.loadLimit.mockResolvedValue([{ auth }])

    await binding.loadAuthByForeignKey("inbox-1", fixture.tx as never)
    await binding.saveAuthByForeignKey(
      "inbox-1",
      auth,
      undefined,
      fixture.tx as never,
    )
    await binding.deleteRowByForeignKey("inbox-1", fixture.tx as never)

    expect(mocks.and).toHaveBeenCalledTimes(3)
    expect(mocks.eq).toHaveBeenCalledWith(expect.anything(), "instagram")
  })

  it("keeps only declared config columns when inserting a workspace integration", async () => {
    const binding = bindingOrThrow("claude")
    const fixture = makeTx()

    const result = await binding.insertRow(
      {
        workspaceId: "workspace-1",
        auth,
        descriptor: { sourceId: "workspace", displayName: "Claude" },
        config: {
          model: "claude-test",
          workspaceId: "attacker-workspace",
          integrationId: "attacker-integration",
        },
      },
      fixture.tx as never,
    )

    expect(result).toEqual({
      id: "satellite-1",
      integrationId: "integration-1",
    })
    expect(fixture.insertValues).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth,
        integrationId: "integration-1",
        model: "claude-test",
        workspaceId: "workspace-1",
      }),
    )
    expect(fixture.insertValues).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ integrationId: "attacker-integration" }),
    )
  })
})
