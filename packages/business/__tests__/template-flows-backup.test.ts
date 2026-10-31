// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

vi.mock("../src/decision/profile-service", () => ({
  decisionProfileService: { assertFlowReferencesPublishable: vi.fn() },
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: {} },
  eq: vi.fn(),
  and: vi.fn(),
}))
vi.mock("@chatbotx.io/database/partials", () => ({ rootFolderId: "0" }))
vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: { table: "Flow" },
  flowVersionModel: { table: "FlowVersion" },
}))
vi.mock("../src/flow", () => ({ flowService: {} }))
vi.mock("../src/flow-version", () => ({ flowVersionService: {} }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  flowVersionRepository: {},
  referenceExistenceRepository: {},
  isVerifiableReferenceKind: () => false,
}))

const { flowsAdapter } = await import("../src/template/adapters/flows")

const makeTx = () => {
  const writes: { table: string; set: Record<string, unknown> }[] = []
  const tx = {
    update: (model: { table: string }) => ({
      set: (set: Record<string, unknown>) => {
        writes.push({ table: model.table, set })
        const done = Promise.resolve([{ currentVersionId: "v1" }])
        return { where: () => Object.assign(done, { returning: () => done }) }
      },
    }),
  }
  return { tx: tx as never, writes }
}

const backup = (overrides: Record<string, unknown> = {}) => ({
  name: "Welcome",
  published: true,
  startNodeId: "n1",
  nodes: [{ id: "n1" }, { id: "n2" }],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
  ...overrides,
})

const rejection = async (promise: Promise<unknown>) =>
  await promise.then(
    () => null,
    (error: unknown) => error,
  )

describe("flow backup restore: structural checks", () => {
  test("a consistent draft is written back (draft only)", async () => {
    const { tx, writes } = makeTx()
    await flowsAdapter.sync.restoreBackup(tx, "flow-1", backup(), 1)
    expect(writes.map((write) => write.table)).toEqual(["Flow", "FlowVersion"])
    expect(writes[1].set).toMatchObject({ startNodeId: "n1" })
  })

  test.each([
    [
      "an edge to a missing node",
      { edges: [{ id: "e1", source: "n1", target: "ghost" }] },
    ],
    [
      "an edge from a missing node",
      { edges: [{ id: "e1", source: "ghost", target: "n2" }] },
    ],
    ["duplicate node ids", { nodes: [{ id: "n1" }, { id: "n1" }] }],
    [
      "duplicate edge ids",
      {
        edges: [
          { id: "e1", source: "n1", target: "n2" },
          { id: "e1", source: "n2", target: "n1" },
        ],
      },
    ],
    ["a start node that is not in the graph", { startNodeId: "ghost" }],
    ["an edge without an id", { edges: [{ source: "n1", target: "n2" }] }],
  ])("refuses %s and writes nothing", async (_label, overrides) => {
    const { tx, writes } = makeTx()
    const error = await rejection(
      flowsAdapter.sync.restoreBackup(tx, "flow-1", backup(overrides), 1),
    )
    expect(error).toBeInstanceOf(Error)
    expect(writes).toHaveLength(0)
  })

  test("an unfinished (empty) draft is still restorable", async () => {
    const { tx, writes } = makeTx()
    await flowsAdapter.sync.restoreBackup(
      tx,
      "flow-1",
      backup({ nodes: [], edges: [], startNodeId: "" }),
      1,
    )
    expect(writes).toHaveLength(2)
  })

  test("a foreign backup format is refused", async () => {
    const { tx } = makeTx()
    expect(
      await rejection(
        flowsAdapter.sync.restoreBackup(tx, "flow-1", backup(), 2),
      ),
    ).toMatchObject({ code: "templateBackupNotRestorable" })
  })
})
