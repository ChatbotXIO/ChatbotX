// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertedByTable: new Map<string, Record<string, unknown>[]>(),
  updates: [] as { set: Record<string, unknown> }[],
  sequenceFindMany: vi.fn(),
  stepFindMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      sequenceModel: { findMany: mocks.sequenceFindMany },
      sequenceStepModel: { findMany: mocks.stepFindMany },
    },
  },
  eq: vi.fn(),
  isUniqueViolationError: () => false,
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceModel: { table: "sequence" },
  sequenceStepModel: { table: "step" },
}))
let counter = 0
vi.mock("@chatbotx.io/utils", () => ({ createId: () => `new-${++counter}` }))

const { sequencesAdapter } = await import("../src/template/adapters/sequences")

const step = (overrides: Record<string, unknown> = {}) => ({
  order: 1,
  delayDays: 1,
  delayMinutes: 0,
  delayUnit: "days",
  specificDateTime: null,
  isActive: true,
  anytime: true,
  sendTimeStart: null,
  sendTimeEnd: null,
  sendDays: null,
  flowId: "src-flow",
  ...overrides,
})

const makeTx = () => {
  const tx: Record<string, unknown> = {
    insert: (model: { table: string }) => ({
      values: (values: unknown) => {
        const rows = (Array.isArray(values) ? values : [values]) as Record<
          string,
          unknown
        >[]
        mocks.insertedByTable.set(model.table, [
          ...(mocks.insertedByTable.get(model.table) ?? []),
          ...rows,
        ])
        return Object.assign(Promise.resolve(), {
          returning: () => Promise.resolve(rows),
        })
      },
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => {
        mocks.updates.push({ set })
        return { where: () => Promise.resolve() }
      },
    }),
  }
  tx.transaction = (callback: (client: unknown) => unknown) => callback(tx)
  return tx
}

const install = async (
  entries: Record<string, unknown>[],
  idMaps: Record<string, Map<string, string>> = {},
) => {
  const warnings: { entityKind: string }[] = []
  const tracked: Record<string, unknown>[] = []
  const ctx = {
    tx: makeTx(),
    workspaceId: "ws-1",
    installationId: "inst-1",
    idMaps,
    track: (entry: Record<string, unknown>) => tracked.push(entry),
    warn: (warning: { entityKind: string }) => warnings.push(warning),
  }
  const patches = await sequencesAdapter.insert(ctx as never, entries as never)
  return { ctx, patches, warnings, tracked }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.insertedByTable.clear()
  mocks.updates.length = 0
})

describe("sequences adapter: install", () => {
  test("copies the sequence with counters reset to what was inserted", async () => {
    const { ctx, tracked } = await install([
      {
        sourceId: "src-seq",
        name: "Welcome drip",
        active: true,
        folderId: null,
        steps: [step(), step({ order: 2, flowId: null })],
      },
    ])

    const [sequence] = mocks.insertedByTable.get("sequence") ?? []
    expect(sequence).toMatchObject({
      name: "Welcome drip",
      workspaceId: "ws-1",
      subscribers: 0,
      messages: 2,
    })
    expect(ctx.idMaps.sequence.get("src-seq")).toBe(sequence.id)
    expect(tracked).toEqual([
      expect.objectContaining({
        resourceKind: "sequence",
        sourceResourceId: "src-seq",
        wasExisting: false,
      }),
    ])
  })

  test("inserts steps without a flow and patches it once flows exist", async () => {
    const { ctx, patches } = await install([
      {
        sourceId: "src-seq",
        name: "Drip",
        active: true,
        folderId: null,
        steps: [step({ flowId: "src-flow" })],
      },
    ])

    const [inserted] = mocks.insertedByTable.get("step") ?? []
    expect(inserted).toMatchObject({ flowId: null, delayDays: 1 })

    ctx.idMaps.flow = new Map([["src-flow", "tgt-flow"]])
    await patches[0].apply(ctx as never)

    expect(mocks.updates).toEqual([{ set: { flowId: "tgt-flow" } }])
  })

  test("leaves a step's flow empty and warns when the flow did not come along", async () => {
    const { ctx, patches } = await install([
      {
        sourceId: "src-seq",
        name: "Drip",
        active: true,
        folderId: null,
        steps: [step({ flowId: "missing" })],
      },
    ])
    const patchWarnings: { entityKind: string }[] = []

    await patches[0].apply({
      ...ctx,
      idMaps: {},
      warn: (warning: { entityKind: string }) => patchWarnings.push(warning),
    } as never)

    expect(mocks.updates).toEqual([])
    expect(patchWarnings).toEqual([
      expect.objectContaining({ entityKind: "flow" }),
    ])
  })

  test("maps the folder and warns when it is unresolved", async () => {
    const { warnings } = await install([
      {
        sourceId: "src-seq",
        name: "Drip",
        active: true,
        folderId: "src-folder",
        steps: [],
      },
    ])

    const [sequence] = mocks.insertedByTable.get("sequence") ?? []
    expect(sequence.folderId).toBeNull()
    expect(warnings).toEqual([
      expect.objectContaining({ entityKind: "folder" }),
    ])
  })

  test("a sequence without steps inserts no step rows", async () => {
    await install([
      {
        sourceId: "s",
        name: "Empty",
        active: false,
        folderId: null,
        steps: [],
      },
    ])

    expect(mocks.insertedByTable.get("step")).toBeUndefined()
  })
})

describe("sequences adapter: collect", () => {
  test("ships the steps in order and reports their flows as hard dependencies", async () => {
    mocks.sequenceFindMany.mockResolvedValue([
      { id: "seq-1", name: "Drip", active: true, folderId: "f1" },
    ])
    mocks.stepFindMany.mockResolvedValue([
      {
        sequenceId: "seq-1",
        order: 1,
        delayDays: 1,
        delayMinutes: 0,
        delayUnit: "days",
        specificDateTime: null,
        isActive: true,
        anytime: true,
        sendTimeStart: null,
        sendTimeEnd: null,
        sendDays: null,
        flowId: "flow-a",
      },
      {
        sequenceId: "seq-1",
        order: 2,
        delayDays: 2,
        delayMinutes: 0,
        delayUnit: "days",
        specificDateTime: new Date("2026-12-01T00:00:00Z"),
        isActive: true,
        anytime: true,
        sendTimeStart: null,
        sendTimeEnd: null,
        sendDays: null,
        flowId: "flow-a",
      },
    ])

    const result = await sequencesAdapter.collector.collect("ws-1", ["seq-1"])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({
      sourceId: "seq-1",
      name: "Drip",
      steps: [
        expect.objectContaining({ order: 1 }),
        expect.objectContaining({
          order: 2,
          specificDateTime: "2026-12-01T00:00:00.000Z",
        }),
      ],
    })
    expect(result.folderIds).toEqual(["f1"])
    // Two steps share a flow: reported once.
    expect(result.hardDependencies).toEqual([
      { category: "flows", sourceId: "flow-a" },
    ])
    expect(mocks.stepFindMany).toHaveBeenCalledTimes(1)
  })

  test("collects nothing, and queries nothing, for an empty selection", async () => {
    await expect(
      sequencesAdapter.collector.collect("ws-1", []),
    ).resolves.toMatchObject({ entries: [], hardDependencies: [] })
    expect(mocks.sequenceFindMany).not.toHaveBeenCalled()
  })
})
