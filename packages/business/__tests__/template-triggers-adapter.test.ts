// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { insertedValues } = vi.hoisted(() => ({
  insertedValues: vi.fn(),
}))

vi.mock("../src/template/adapters/naming", () => ({
  insertWithNameRetry: async (
    tx: unknown,
    _constraint: string,
    name: string,
    insert: (tx: unknown, candidateName: string) => Promise<unknown>,
  ) => await insert(tx, name),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))
vi.mock("@chatbotx.io/database/schema", () => ({ triggerModel: {} }))

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
