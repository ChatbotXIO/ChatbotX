// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ resolveByNameAndType: vi.fn() }))

vi.mock("../src/custom-field/service", () => ({
  customFieldService: { resolveByNameAndType: mocks.resolveByNameAndType },
}))

const { resolveCustomFieldManifest } = await import(
  "../src/template/adapters/manifests/custom-fields"
)

const buildContext = () => ({
  tx: {} as never,
  workspaceId: "ws-1",
  installationId: "install-1",
  idMaps: {} as Record<string, Map<string, string>>,
  track: vi.fn(),
  warn: vi.fn(),
  customFieldNameBindings: undefined as Map<string, string> | undefined,
})

describe("resolveCustomFieldManifest — name collisions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("a renamed field is mapped, warned once, and its token name is bound", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      resolved: new Map([
        [
          "text:zz_cf_conflict",
          { id: "9", name: "zz_cf_conflict_1", renamed: true },
        ],
      ]),
      createdIds: ["9"],
    })
    const ctx = buildContext()

    await resolveCustomFieldManifest(ctx, {
      "100": { name: "zz_cf_conflict", type: "text" },
    } as never)

    expect(ctx.idMaps.customField?.get("100")).toBe("9")
    expect(ctx.warn).toHaveBeenCalledTimes(1)
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        entityKind: "customFieldRenamed",
        value: "zz_cf_conflict -> zz_cf_conflict_1 (text)",
      }),
    )
    expect(ctx.customFieldNameBindings?.get("zz_cf_conflict")).toBe(
      "zz_cf_conflict_1",
    )
  })

  test("reusing a field under another spelling binds the token without a warning", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      resolved: new Map([
        ["text:foo", { id: "5", name: "foo", renamed: false }],
      ]),
      createdIds: [],
    })
    const ctx = buildContext()

    await resolveCustomFieldManifest(ctx, {
      "100": { name: "Foo", type: "text" },
    } as never)

    expect(ctx.warn).not.toHaveBeenCalled()
    expect(ctx.customFieldNameBindings?.get("Foo")).toBe("foo")
    expect(ctx.track).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "5", wasExisting: true }),
    )
  })

  test("an unchanged name needs no binding", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      resolved: new Map([
        ["text:size", { id: "5", name: "size", renamed: false }],
      ]),
      createdIds: ["5"],
    })
    const ctx = buildContext()

    await resolveCustomFieldManifest(ctx, {
      "100": { name: "size", type: "text" },
    } as never)

    expect(ctx.customFieldNameBindings?.size).toBe(0)
  })

  test("two source fields sharing one name are never bound, and the ambiguity is reported", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      resolved: new Map([
        ["text:size", { id: "5", name: "size", renamed: false }],
        ["number:size", { id: "6", name: "size_1", renamed: true }],
      ]),
      createdIds: ["5", "6"],
    })
    const ctx = buildContext()

    await resolveCustomFieldManifest(ctx, {
      "100": { name: "size", type: "text" },
      "101": { name: "size", type: "number" },
    } as never)

    expect(ctx.customFieldNameBindings?.has("size")).toBe(false)
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "ambiguousSourceFieldToken" }),
    )
  })

  test("a manifest field that could not be resolved is reported, not mapped", async () => {
    mocks.resolveByNameAndType.mockResolvedValue({
      resolved: new Map(),
      createdIds: [],
    })
    const ctx = buildContext()

    await resolveCustomFieldManifest(ctx, {
      "100": { name: "gone", type: "text" },
    } as never)

    expect(ctx.idMaps.customField?.has("100")).toBe(false)
    expect(ctx.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "customField", value: "100" }),
    )
  })
})
