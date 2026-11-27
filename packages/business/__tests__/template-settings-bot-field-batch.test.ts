// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  lockNames: vi.fn(),
  planResolution: vi.fn(),
  create: vi.fn(),
}))

vi.mock("../src/bot-field/service", () => ({
  botFieldService: {
    lockNames: mocks.lockNames,
    planResolution: mocks.planResolution,
    create: mocks.create,
  },
}))

const { settingsAdapter } = await import("../src/template/adapters/settings")

const ctx = () => ({
  tx: {} as never,
  workspaceId: "ws",
  installationId: "i",
  idMaps: {} as Record<string, Map<string, string>>,
  track: vi.fn(),
  warn: vi.fn(),
})

const field = (sourceId: string, name: string) => ({
  kind: "botField" as const,
  sourceId,
  name,
  type: "number" as const,
  value: sourceId,
  description: null,
  folderId: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: `new-${data.name}`, name: data.name }),
  )
})

describe("settings bot fields", () => {
  test("are planned once for the whole batch, so a renamed field never swallows another", async () => {
    mocks.planResolution.mockResolvedValue({
      plans: new Map([
        ["number:price", { action: "rename", plannedName: "price_2" }],
        ["number:price_1", { action: "create", plannedName: "price_1" }],
      ]),
    })
    const context = ctx()

    await settingsAdapter.insertEarly?.(
      context as never,
      [field("1", "price"), field("2", "price_1")] as never,
    )

    expect(mocks.planResolution).toHaveBeenCalledTimes(1)
    expect(context.idMaps.botField).toEqual(
      new Map([
        ["1", "new-price_2"],
        ["2", "new-price_1"],
      ]),
    )
  })

  test("names differing only in case share one row, created once", async () => {
    mocks.planResolution.mockResolvedValue({
      plans: new Map([
        ["number:price", { action: "create", plannedName: "Price" }],
      ]),
    })
    const context = ctx()

    await settingsAdapter.insertEarly?.(
      context as never,
      [field("1", "Price"), field("2", "price")] as never,
    )

    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(context.idMaps.botField).toEqual(
      new Map([
        ["1", "new-Price"],
        ["2", "new-Price"],
      ]),
    )
  })
})
