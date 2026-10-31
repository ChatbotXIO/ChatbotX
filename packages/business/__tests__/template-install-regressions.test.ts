// @vitest-environment node

import { remapFlowGraphReferences } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { rewriteFieldTokens } from "../src/template/field-token-binder"

const mocks = vi.hoisted(() => ({
  upsertByNames: vi.fn(),
  customFieldRows: [] as { id: string; name: string }[],
}))

vi.mock("@chatbotx.io/database/client", () => ({
  inArray: (column: unknown, values: unknown) => ({ column, values }),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  tagModel: { table: "Tag" },
  customFieldModel: { table: "CustomField", id: "id", name: "name" },
}))
vi.mock("../src/tag/service", () => ({
  tagService: { upsertByNames: mocks.upsertByNames },
}))

const { resolveTagManifest } = await import(
  "../src/template/adapters/manifests/tags"
)
const { durableFieldNameBindings } = await import(
  "../src/template/sync-field-bindings"
)

describe("E1: a flow with Add Tag installed from a template without the tags category", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("the manifest creates the tag, the flow points at it, and nothing is warned", async () => {
    mocks.upsertByNames.mockResolvedValue([
      { id: "tgt-tag", name: "zz_tpl_test" },
    ])
    const warn = vi.fn()
    const ctx = {
      tx: {
        query: { tagModel: { findMany: () => Promise.resolve([]) } },
        update: vi.fn(),
      } as never,
      workspaceId: "ws-2",
      installationId: "inst-1",
      idMaps: {} as Record<string, Map<string, string>>,
      track: vi.fn(),
      warn,
    }

    await resolveTagManifest(ctx, { "678679": { name: "zz_tpl_test" } })

    const unresolved = vi.fn()
    const remapped = remapFlowGraphReferences(
      {
        nodes: [
          {
            id: "n1",
            data: {
              details: {
                steps: [
                  { id: "s1", stepType: "addContactTag", tagIds: ["678679"] },
                ],
              },
            },
          },
        ],
        edges: [],
      } as never,
      ctx.idMaps,
      { kinds: ["tag"], onUnresolved: unresolved },
    )

    const step = (
      remapped.nodes[0] as unknown as {
        data: { details: { steps: { tagIds: string[] }[] } }
      }
    ).data.details.steps[0]
    expect(step.tagIds).toEqual(["tgt-tag"])
    expect(unresolved).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(ctx.track).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "tag",
        resourceId: "tgt-tag",
        wasExisting: false,
      }),
    )
  })
})

describe("two syncs keep {{foo_1}}", () => {
  const manifest = { "10": { name: "foo", type: "text" } } as never
  const txWith = (rows: { id: string; name: string }[]) =>
    ({
      select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
    }) as never

  test("the durable binding follows the installed name, so a later sync never reverts the token", async () => {
    // The install resolved source field 10 to the target "foo_1".
    const bindings = await durableFieldNameBindings(
      txWith([{ id: "t1", name: "foo_1" }]),
      manifest,
      new Map([["10", "t1"]]),
    )

    expect(bindings.get("foo")).toBe("foo_1")
    // Sync 1 and sync 2 both rewrite the shipped token the same way.
    for (let sync = 0; sync < 2; sync++) {
      expect(rewriteFieldTokens("Hi {{foo}}", bindings)).toBe("Hi {{foo_1}}")
    }
  })

  test("a field still installed under its own name needs no binding", async () => {
    const bindings = await durableFieldNameBindings(
      txWith([{ id: "t1", name: "foo" }]),
      manifest,
      new Map([["10", "t1"]]),
    )
    expect(bindings.size).toBe(0)
  })

  test("nothing mapped means no query and no bindings", async () => {
    const select = vi.fn()
    const bindings = await durableFieldNameBindings(
      { select } as never,
      manifest,
      new Map(),
    )
    expect(bindings.size).toBe(0)
    expect(select).not.toHaveBeenCalled()
  })
})
