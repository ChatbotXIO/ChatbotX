// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { insertedValues } = vi.hoisted(() => ({
  insertedValues: vi.fn(),
}))

vi.mock("../src/template/adapters/naming", () => ({
  insertCopyNamed: async (
    ctx: { tx: unknown },
    input: {
      entry: { name: string }
      insert: (tx: unknown, name: string) => Promise<unknown>
    },
  ) => await input.insert(ctx.tx, input.entry.name),
}))

// `eq` builds the condition-row delete's predicate, which the fake tx ignores.
vi.mock("@chatbotx.io/database/client", () => ({ db: {}, eq: () => ({}) }))
// Partial: the trigger service's import graph reads other models at load time.
vi.mock(import("@chatbotx.io/database/schema"), async (importOriginal) => ({
  ...(await importOriginal()),
  triggerModel: {} as never,
}))

const { triggersAdapter } = await import("../src/template/adapters/triggers")

const buildContext = (idMaps: Record<string, Map<string, string>> = {}) => ({
  tx: {
    insert: () => ({
      values: (values: unknown) => {
        insertedValues(values)
        return { returning: () => Promise.resolve([{ id: "new-trigger" }]) }
      },
    }),
  } as never,
  workspaceId: "ws-1",
  installationId: "install-1",
  idMaps,
  track: vi.fn(),
  warn: vi.fn(),
})

const triggerEntry = {
  sourceId: "src-trigger",
  name: "Welcome",
  active: true,
  folderId: null,
  actions: [
    { type: "addSequence", sequenceIds: ["src-seq-1", "src-seq-gone"] },
    { type: "removeSequence", sequenceIds: ["src-seq-2"] },
  ],
}

// Sequences are not a template resource yet, so nothing fills
// `idMaps.sequence` during a real install and sequence ids stay as-is with a
// warning. These tests pin the remap engine's contract for when a sequences
// adapter provides that map.
describe("triggersAdapter sequence actions", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("remaps every sequence id of add/remove sequence actions to the installed sequence", async () => {
    const ctx = buildContext({
      sequence: new Map([
        ["src-seq-1", "target-seq-1"],
        ["src-seq-gone", "target-seq-gone"],
        ["src-seq-2", "target-seq-2"],
      ]),
    })

    await triggersAdapter.insert(ctx, [triggerEntry])

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: [
          {
            type: "addSequence",
            sequenceIds: ["target-seq-1", "target-seq-gone"],
          },
          { type: "removeSequence", sequenceIds: ["target-seq-2"] },
        ],
      }),
    )
    expect(ctx.warn).not.toHaveBeenCalled()
  })

  test("warns with the action path for a sequence id that was not installed", async () => {
    const ctx = buildContext({
      sequence: new Map([
        ["src-seq-1", "target-seq-1"],
        ["src-seq-2", "target-seq-2"],
      ]),
    })

    await triggersAdapter.insert(ctx, [triggerEntry])

    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "triggers",
        entityKind: "sequence",
        value: "src-seq-gone",
        path: expect.stringContaining("triggers.src-trigger.actions."),
      }),
    )
  })
})

describe("triggersAdapter post-comment conditions", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const unpinned = {
    type: "contactCommentedOnPost",
    sourceId: null,
    operator: null,
    value: { scope: "publishedFromPosts", channelPostIds: [] },
  }
  const pinnedPosts = {
    type: "contactFirstCommentedOnPost",
    sourceId: null,
    operator: null,
    value: { scope: "selected", channelPostIds: ["src-post-1"] },
  }

  const contextWithConditionWrites = () => {
    const updates: unknown[] = []
    const ctx = buildContext()
    return {
      updates,
      ctx: {
        ...ctx,
        tx: {
          insert: (_table: unknown) => ({
            values: (values: unknown) => {
              insertedValues(values)
              return {
                returning: () =>
                  Promise.resolve([{ id: "new-trigger", active: true }]),
              }
            },
          }),
          delete: () => ({ where: () => Promise.resolve() }),
          update: () => ({
            set: (values: unknown) => {
              updates.push(values)
              return { where: () => Promise.resolve() }
            },
          }),
        } as never,
      },
    }
  }

  test("a condition that pins nothing installs unchanged and the trigger stays active", async () => {
    const { ctx, updates } = contextWithConditionWrites()

    await triggersAdapter.insert(ctx, [
      { ...triggerEntry, actions: [], conditions: [unpinned] },
    ])

    expect(insertedValues).toHaveBeenLastCalledWith([
      expect.objectContaining({
        type: "contactCommentedOnPost",
        sourceId: null,
        value: unpinned.value,
      }),
    ])
    expect(updates).toEqual([])
    expect(ctx.warn).not.toHaveBeenCalled()
  })

  test("a condition pinned to posts of the source workspace is dropped, warned, and the trigger switched off", async () => {
    const { ctx, updates } = contextWithConditionWrites()

    await triggersAdapter.insert(ctx, [
      { ...triggerEntry, actions: [], conditions: [unpinned, pinnedPosts] },
    ])

    expect(insertedValues).toHaveBeenLastCalledWith([
      expect.objectContaining({ type: "contactCommentedOnPost" }),
    ])
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityKind: "referenceRemoved",
        path: "triggers.src-trigger.conditions.1",
        value: "channelPost:src-post-1",
      }),
    )
    expect(updates).toEqual([{ active: false }])
  })
})
