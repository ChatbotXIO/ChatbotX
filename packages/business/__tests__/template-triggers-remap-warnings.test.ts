// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ removed: [] as string[] }))

vi.mock("../src/template/adapters/naming", () => ({
  insertCopyNamed: async (
    ctx: { tx: unknown },
    input: {
      entry: { name: string }
      insert: (tx: unknown, name: string) => Promise<unknown>
    },
  ) => await input.insert(ctx.tx, input.entry.name),
}))
vi.mock("../src/template/reference-sanitizer", () => ({
  sanitizeEntryReferences: async (input: { value: unknown }) => ({
    value: input.value,
    removed: mocks.removed,
  }),
}))
vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock(import("@chatbotx.io/database/schema"), async (importOriginal) => ({
  ...(await importOriginal()),
  triggerModel: {} as never,
}))

const { triggersAdapter } = await import("../src/template/adapters/triggers")

const buildContext = () => ({
  tx: {
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([{ id: "new-trigger" }]),
      }),
    }),
  } as never,
  workspaceId: "ws-1",
  installationId: "install-1",
  idMaps: {},
  track: vi.fn(),
  warn: vi.fn(),
})

const entry = {
  sourceId: "src-trigger",
  name: "Welcome",
  active: true,
  folderId: null,
  actions: [{ type: "addSequence", sequenceIds: ["src-seq-gone"] }],
}

describe("triggers adapter: an unresolved reference is reported once", () => {
  beforeEach(() => {
    mocks.removed = []
  })

  test("a reference the sanitizer removed warns only as referenceRemoved", async () => {
    mocks.removed = ["[0].sequenceIds[0]"]
    const ctx = buildContext()

    await triggersAdapter.insert(ctx, [entry])

    const warnings = ctx.warn.mock.calls.map(([warning]) => warning)
    expect(warnings).toEqual([
      expect.objectContaining({
        entityKind: "referenceRemoved",
        path: "triggers.src-trigger.actions.[0].sequenceIds[0]",
      }),
    ])
  })

  test("a reference left in place keeps its own kind warning", async () => {
    const ctx = buildContext()

    await triggersAdapter.insert(ctx, [entry])

    const warnings = ctx.warn.mock.calls.map(([warning]) => warning)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      category: "triggers",
      entityKind: "sequence",
      value: "src-seq-gone",
    })
  })
})
