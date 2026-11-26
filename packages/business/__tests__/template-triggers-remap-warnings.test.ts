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

describe("triggers adapter: actions that name pipelines and assignees", () => {
  test("pipeline, stage and pipeline-field ids are remapped to the target workspace", async () => {
    const inserted: { actions: unknown }[] = []
    const ctx = {
      ...buildContext(),
      tx: {
        insert: () => ({
          values: (row: { actions: unknown }) => {
            inserted.push(row)
            return { returning: () => Promise.resolve([{ id: "new-trigger" }]) }
          },
        }),
      } as never,
      idMaps: {
        pipeline: new Map([["src-pipeline", "tgt-pipeline"]]),
        pipelineStage: new Map([["src-stage", "tgt-stage"]]),
        pipelineField: new Map([["src-field", "tgt-field"]]),
      },
    }

    await triggersAdapter.insert(ctx, [
      {
        ...entry,
        actions: [
          {
            type: "pipeline",
            pipelineId: "src-pipeline",
            stageId: "src-stage",
            pipelineFieldId: "src-field",
          },
        ],
      },
    ])

    expect(inserted[0]?.actions).toEqual([
      {
        type: "pipeline",
        pipelineId: "tgt-pipeline",
        stageId: "tgt-stage",
        pipelineFieldId: "tgt-field",
      },
    ])
  })

  test("an assign action naming a member of the source workspace is dropped with a warning", async () => {
    const inserted: { actions: unknown }[] = []
    const ctx = {
      ...buildContext(),
      tx: {
        insert: () => ({
          values: (row: { actions: unknown }) => {
            inserted.push(row)
            return { returning: () => Promise.resolve([{ id: "new-trigger" }]) }
          },
        }),
      } as never,
    }

    await triggersAdapter.insert(ctx, [
      {
        ...entry,
        actions: [
          { type: "assignConversation", assignedId: "u_123" },
          { type: "addSequence", sequenceIds: ["gone"] },
        ],
      },
    ])

    expect(inserted[0]?.actions).toEqual([
      { type: "addSequence", sequenceIds: ["gone"] },
    ])
    expect(ctx.warn.mock.calls.map(([warning]) => warning)).toEqual([
      expect.objectContaining({
        entityKind: "sequence",
        path: "triggers.src-trigger.actions.[1].sequenceIds[0]",
      }),
      expect.objectContaining({
        entityKind: "referenceRemoved",
        path: "triggers.src-trigger.actions.assignConversation.assignedId",
      }),
    ])
  })

  test("a pipeline action's member and team assignees are stripped, not copied", async () => {
    const inserted: { actions: unknown }[] = []
    const ctx = {
      ...buildContext(),
      tx: {
        insert: () => ({
          values: (row: { actions: unknown }) => {
            inserted.push(row)
            return { returning: () => Promise.resolve([{ id: "new-trigger" }]) }
          },
        }),
      } as never,
    }

    await triggersAdapter.insert(ctx, [
      {
        ...entry,
        actions: [{ type: "pipeline", assigneeMemberIds: ["777"] }],
      },
    ])

    expect(
      ctx.warn.mock.calls.map(([warning]) => warning.entityKind),
    ).toContain("workspaceMember")
  })
})
