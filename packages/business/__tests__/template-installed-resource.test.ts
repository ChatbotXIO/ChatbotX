// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { mockFindMany, routeFindMany } = vi.hoisted(() => {
  const mockFindMany = vi.fn()
  type Where = Record<string, unknown> & {
    OR?: { resourceKind: string; resourceId: { in: string[] } }[]
  }
  /**
   * The live-key lookup (the only query carrying an `OR`) answers "every
   * requested key is live"; every other query goes to the scripted mock.
   */
  const routeFindMany = (arg: { where: Where }) =>
    arg.where.OR
      ? arg.where.OR.flatMap((clause) =>
          clause.resourceId.in.map((resourceId) => ({
            resourceKind: clause.resourceKind,
            resourceId,
          })),
        )
      : mockFindMany(arg)
  return { mockFindMany, routeFindMany }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { templateInstalledResourceModel: { findMany: routeFindMany } },
  },
}))

const { templateResourceKinds } = await import("@chatbotx.io/database/partials")
const { TEMPLATE_LOCKED_CONTENT_KEYS } = await import(
  "../src/template/lock-policy"
)
const {
  assertDeletable,
  assertEditable,
  assertReferencable,
  assertResourceEditable,
  listLockedIds,
} = await import("../src/template/installed-resource.service")

/** A fresh transaction stand-in per call: the lock set is remembered per handle. */
const stubTx = () =>
  ({
    execute: vi.fn(),
    query: {
      templateInstalledResourceModel: {
        // Tombstone lookups are not what these cases script.
        findMany: (arg: { where: Record<string, unknown> }) =>
          "uninstallOutcome" in arg.where ? [] : routeFindMany(arg),
      },
    },
  }) as never

const base = {
  workspaceId: "ws-1",
  resourceKind: "flow",
  resourceIds: ["f1", "f2"],
}

describe("assertEditable takes the per-resource locks", () => {
  const makeTx = (live: Record<string, string[]>) => ({
    execute: vi.fn(),
    query: {
      templateInstalledResourceModel: {
        findMany: vi.fn(
          async ({ where }: { where: Record<string, unknown> }) => {
            await Promise.resolve()
            if ("allowEdit" in where || "uninstallOutcome" in where) {
              return []
            }
            const clauses = (where.OR ?? []) as {
              resourceKind: string
              resourceId: { in: string[] }
            }[]
            return clauses.flatMap((clause) =>
              clause.resourceId.in
                .filter((id) => (live[clause.resourceKind] ?? []).includes(id))
                .map((resourceId) => ({
                  resourceKind: clause.resourceKind,
                  resourceId,
                })),
            )
          },
        ),
      },
    },
  })

  test("a write on a resource with no live provenance row takes no lock", async () => {
    const tx = makeTx({})

    await assertEditable({
      ...base,
      resourceIds: ["f1"],
      changedKeys: ["nodes"],
      lockedContentKeys: ["nodes"],
      tx: tx as never,
    })

    expect(tx.execute).not.toHaveBeenCalled()
  })

  test("a toggle on an installed resource takes its lock, so an uninstall's tombstone is seen", async () => {
    const tx = makeTx({ flow: ["f1"] })

    await assertEditable({
      ...base,
      resourceIds: ["f1"],
      changedKeys: ["active"],
      lockedContentKeys: ["nodes"],
      tx: tx as never,
    })

    expect(tx.execute).toHaveBeenCalledTimes(1)
    const wheres =
      tx.query.templateInstalledResourceModel.findMany.mock.calls.map(
        ([arg]) => arg.where,
      )
    // Never the edit-permission check: a toggle is the installer's own.
    expect(wheres.some((where) => "allowEdit" in where)).toBe(false)
  })

  test("a toggle on a tombstoned copy is rejected", async () => {
    const tx = makeTx({ flow: ["f1"] })
    tx.query.templateInstalledResourceModel.findMany.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          "uninstallOutcome" in where
            ? [{ resourceId: "f1" }]
            : [{ resourceKind: "flow", resourceId: "f1" }],
        ),
    )

    await expect(
      assertEditable({
        ...base,
        resourceIds: ["f1"],
        changedKeys: ["active"],
        lockedContentKeys: ["nodes"],
        tx: tx as never,
      }),
    ).rejects.toMatchObject({ code: "templateUninstallInProgress" })
  })

  test("a content write locks the resource and its installed parents in one pass", async () => {
    const tx = makeTx({ reflink: ["r1"], flow: ["f9"] })

    await assertEditable({
      ...base,
      resourceKind: "reflink",
      resourceIds: ["r1"],
      changedKeys: ["flowId"],
      lockedContentKeys: ["flowId"],
      referencedParents: [
        { kind: "flow", resourceId: "f9" },
        { kind: "flow", resourceId: "not-installed" },
      ],
      tx: tx as never,
    })

    // flow:f9 sorts before reflink:r1; both go in ONE statement and the
    // uninstalled parent is not locked.
    expect(tx.execute).toHaveBeenCalledTimes(1)
  })
})

describe("changedKeysOf", () => {
  test("an unchanged full-form save changes nothing", async () => {
    const { changedKeysOf } = await import(
      "../src/template/installed-resource.service"
    )
    const stored = { name: "A", flowId: "f1", branding: { logo: 1, size: 2 } }

    expect(
      changedKeysOf(stored, {
        name: "A",
        flowId: "f1",
        branding: { size: 2, logo: 1 },
      }),
    ).toEqual([])
  })

  test("reports only the keys whose value differs, and ignores undefined", async () => {
    const { changedKeysOf } = await import(
      "../src/template/installed-resource.service"
    )

    expect(
      changedKeysOf(
        { name: "A", flowId: "f1", text: "x" },
        { name: "B", flowId: "f1", text: undefined },
      ),
    ).toEqual(["name"])
  })
})

describe("changedKeysOf treats an empty text as no text", () => {
  test('a form\'s "" for a stored null is not a change', async () => {
    const { changedKeysOf } = await import(
      "../src/template/installed-resource.service"
    )
    expect(
      changedKeysOf(
        { customCss: null, name: "Chat" },
        { customCss: "", name: "Chat" },
      ),
    ).toEqual([])
    expect(changedKeysOf({ customCss: null }, { customCss: "a{}" })).toEqual([
      "customCss",
    ])
  })
})

describe("changedStoredContentKeys (stored rows before and after a write)", () => {
  test("rewritten child rows with new ids, another order and their parent key are unchanged content", async () => {
    const { changedStoredContentKeys } = await import(
      "../src/template/installed-resource.service"
    )
    const before = {
      name: "Shirt",
      rank: 1,
      variants: [
        { id: "1", productId: "p", sku: "A", createdAt: new Date(1) },
        { id: "2", productId: "p", sku: "B", createdAt: new Date(1) },
      ],
      variantOptions: [{ id: "9", productId: "p", name: "Size" }],
    }
    const after = {
      name: "Shirt",
      rank: 7,
      variants: [
        { id: "12", productId: "p", sku: "B", createdAt: new Date(2) },
        { id: "11", productId: "p", sku: "A", createdAt: new Date(2) },
      ],
      variantOptions: [{ id: "19", productId: "p", name: "Size" }],
    }
    expect(
      changedStoredContentKeys({
        resourceKind: "product",
        before,
        after,
        parentKeys: ["productId"],
        keyMap: { options: "variantOptions" },
      }),
    ).toEqual([])
  })

  test("a real change of locked content is reported by its policy key", async () => {
    const { changedStoredContentKeys } = await import(
      "../src/template/installed-resource.service"
    )
    expect(
      changedStoredContentKeys({
        resourceKind: "product",
        before: { name: "Shirt", variantOptions: [{ name: "Size" }] },
        after: { name: "Shirt", variantOptions: [{ name: "Colour" }] },
        keyMap: { options: "variantOptions" },
      }),
    ).toEqual(["options"])
  })

  test("reordering a jsonb list is a change: the first image is the cover", async () => {
    const { changedStoredContentKeys } = await import(
      "../src/template/installed-resource.service"
    )
    const a = { type: "link", url: "https://example.test/a.png" }
    const b = { type: "link", url: "https://example.test/b.png" }
    expect(
      changedStoredContentKeys({
        resourceKind: "product",
        before: { images: [a, b] },
        after: { images: [b, a] },
      }),
    ).toEqual(["images"])
  })

  test("an empty text and null are the same stored content", async () => {
    const { changedStoredContentKeys } = await import(
      "../src/template/installed-resource.service"
    )
    expect(
      changedStoredContentKeys({
        resourceKind: "calendar",
        before: { description: null, availability: [] },
        after: { description: "", availability: [] },
      }),
    ).toEqual([])
  })
})

describe("template installed-resource guards", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("assertDeletable", () => {
    test("does nothing for an empty id list, without querying", async () => {
      await assertDeletable({ ...base, resourceIds: [] })

      expect(mockFindMany).not.toHaveBeenCalled()
    })

    test("passes when no installed copy locks deletion", async () => {
      mockFindMany.mockResolvedValue([])

      await expect(assertDeletable(base)).resolves.toBeUndefined()
    })

    test("throws when one id is governed by a copy that disallows deletion", async () => {
      mockFindMany.mockResolvedValue([{ resourceId: "f2" }])

      await expect(assertDeletable(base)).rejects.toMatchObject({
        code: "templateAllowDeleteViolation",
      })
    })

    test("asks one query for the whole id set, scoped to active copies of another's making", async () => {
      mockFindMany.mockResolvedValue([])

      await assertDeletable(base)

      expect(mockFindMany).toHaveBeenCalledTimes(1)
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: "ws-1",
            resourceKind: "flow",
            resourceId: { in: ["f1", "f2"] },
            wasExisting: false,
            detachedAt: { isNull: true },
            allowDelete: false,
            installation: {
              sourceDeletedAt: { isNull: true },
              templateId: { isNotNull: true },
            },
          }),
        }),
      )
    })
  })

  describe("assertEditable", () => {
    test("a write touching no content key never checks the edit permission", async () => {
      await assertEditable({
        ...base,
        changedKeys: ["active", "folderId"],
        lockedContentKeys: ["name", "nodes"],
        tx: stubTx(),
      })

      const wheres = mockFindMany.mock.calls.map(([arg]) => arg.where)
      expect(wheres.some((where) => "allowEdit" in where)).toBe(false)
    })

    test("a content write against a locked copy is a 403", async () => {
      mockFindMany.mockResolvedValue([{ resourceId: "f1" }])

      await expect(
        assertEditable({
          ...base,
          changedKeys: ["nodes"],
          lockedContentKeys: ["name", "nodes"],
          tx: stubTx(),
        }),
      ).rejects.toMatchObject({
        code: "templateAllowEditViolation",
        httpStatusCode: 403,
      })
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ allowEdit: false }),
        }),
      )
    })

    test("a content write passes when nothing locks it", async () => {
      mockFindMany.mockResolvedValue([])

      await expect(
        assertEditable({
          ...base,
          changedKeys: ["name"],
          lockedContentKeys: ["name"],
          tx: stubTx(),
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe("assertResourceEditable", () => {
    test("uses the kind's locked content keys", async () => {
      mockFindMany.mockResolvedValue([{ resourceId: "f1" }])

      await expect(
        assertResourceEditable({
          ...base,
          changedKeys: ["nodes"],
          tx: stubTx(),
        }),
      ).rejects.toMatchObject({ code: "templateAllowEditViolation" })
    })

    test("an installer-owned field of the same kind is never checked", async () => {
      await assertResourceEditable({
        ...base,
        changedKeys: ["active"],
        tx: stubTx(),
      })

      const wheres = mockFindMany.mock.calls.map(([arg]) => arg.where)
      expect(wheres.some((where) => "allowEdit" in where)).toBe(false)
    })

    test("a locked product's currency change is refused", async () => {
      mockFindMany.mockResolvedValue([{ resourceId: "p1" }])

      await expect(
        assertResourceEditable({
          workspaceId: "ws-1",
          resourceKind: "product",
          resourceIds: ["p1"],
          changedKeys: ["currency"],
          tx: stubTx(),
        }),
      ).rejects.toMatchObject({ code: "templateAllowEditViolation" })
    })

    test("every resource kind has a lock policy entry", () => {
      for (const kind of templateResourceKinds.options) {
        expect(TEMPLATE_LOCKED_CONTENT_KEYS[kind]).toBeDefined()
      }
    })
  })

  describe("listLockedIds", () => {
    test("returns the locked ids of a list page in one query", async () => {
      mockFindMany.mockResolvedValue([{ resourceId: "f2" }])

      await expect(listLockedIds(base)).resolves.toEqual(["f2"])
      expect(mockFindMany).toHaveBeenCalledTimes(1)
    })
  })
})

describe("assertReferencable (a new reference to a parent)", () => {
  const makeTx = (input: { live: string[]; tombstoned: string[] }) => {
    const order: string[] = []
    return {
      order,
      execute: vi.fn(() => {
        order.push("lock")
      }),
      query: {
        templateInstalledResourceModel: {
          findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
            const tombstone = "uninstallOutcome" in where
            order.push(tombstone ? "tombstone-check" : "live-lookup")
            return Promise.resolve(
              (tombstone ? input.tombstoned : input.live).map((resourceId) => ({
                resourceKind: "flow",
                resourceId,
              })),
            )
          }),
        },
      },
    }
  }
  const parents = [{ kind: "flow" as const, resourceId: "f1" }]

  test("interleaving 2: the tombstone committed first, so the writer that waited is rejected", async () => {
    const tx = makeTx({ live: ["f1"], tombstoned: ["f1"] })

    await expect(
      assertReferencable({ workspaceId: "ws-1", parents, tx: tx as never }),
    ).rejects.toMatchObject({ code: "templateUninstallInProgress" })
    // The parent's lock is taken BEFORE the tombstone is read.
    expect(tx.order).toEqual(["live-lookup", "lock", "tombstone-check"])
  })

  test("interleaving 1: no tombstone yet, the reference is allowed and holds the parent's lock to commit", async () => {
    const tx = makeTx({ live: ["f1"], tombstoned: [] })

    await expect(
      assertReferencable({ workspaceId: "ws-1", parents, tx: tx as never }),
    ).resolves.toBeUndefined()
    expect(tx.execute).toHaveBeenCalledTimes(1)
  })

  test("a parent that is not template-installed takes no lock", async () => {
    const tx = makeTx({ live: [], tombstoned: [] })

    await assertReferencable({ workspaceId: "ws-1", parents, tx: tx as never })

    expect(tx.execute).not.toHaveBeenCalled()
  })
})

describe("a resource nobody installed costs ONE query per guarded write", () => {
  /** A transaction that counts every statement it is asked to run. */
  const makePlainTx = () => ({
    execute: vi.fn(),
    query: {
      templateInstalledResourceModel: {
        findMany: vi.fn(async () => []),
      },
    },
  })

  test("assertEditable on a content write: one lookup, no lock, no tombstone, no permission read", async () => {
    const tx = makePlainTx()

    await assertEditable({
      ...base,
      resourceIds: ["f1"],
      changedKeys: ["nodes", "edges"],
      lockedContentKeys: ["nodes", "edges"],
      referencedParents: [{ kind: "reflink", resourceId: "r1" }],
      tx: tx as never,
    })

    // Own id and parent, two kinds, still ONE statement.
    expect(
      tx.query.templateInstalledResourceModel.findMany,
    ).toHaveBeenCalledTimes(1)
    expect(tx.execute).not.toHaveBeenCalled()
  })

  test("assertResourceEditable on a toggle is also one lookup", async () => {
    const tx = makePlainTx()

    await assertResourceEditable({
      ...base,
      changedKeys: ["active"],
      tx: tx as never,
    })

    expect(
      tx.query.templateInstalledResourceModel.findMany,
    ).toHaveBeenCalledTimes(1)
  })

  test("assertReferencable: one lookup, no lock, no tombstone read", async () => {
    const tx = makePlainTx()

    await assertReferencable({
      workspaceId: "ws-1",
      parents: [
        { kind: "flow", resourceId: "f1" },
        { kind: "reflink", resourceId: "r1" },
      ],
      tx: tx as never,
    })

    expect(
      tx.query.templateInstalledResourceModel.findMany,
    ).toHaveBeenCalledTimes(1)
    expect(tx.execute).not.toHaveBeenCalled()
  })

  test("assertDeletable: one lookup and no blocking read", async () => {
    const tx = makePlainTx()

    await assertDeletable({ ...base, tx: tx as never })

    expect(
      tx.query.templateInstalledResourceModel.findMany,
    ).toHaveBeenCalledTimes(1)
  })

  test("a second guard in the same transaction reuses the answer: still one query in total", async () => {
    const tx = makePlainTx()

    await assertResourceEditable({
      ...base,
      changedKeys: ["nodes"],
      tx: tx as never,
    })
    await assertResourceEditable({
      ...base,
      changedKeys: ["nodes"],
      tx: tx as never,
    })

    expect(
      tx.query.templateInstalledResourceModel.findMany,
    ).toHaveBeenCalledTimes(1)
  })

  test("only the live kinds are checked for a tombstone", async () => {
    const calls: Record<string, unknown>[] = []
    const tx = {
      execute: vi.fn(),
      query: {
        templateInstalledResourceModel: {
          findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
            calls.push(where)
            return where.OR ? [{ resourceKind: "flow", resourceId: "f9" }] : []
          }),
        },
      },
    }

    await assertEditable({
      ...base,
      resourceKind: "reflink",
      resourceIds: ["r1"],
      changedKeys: ["flowId"],
      lockedContentKeys: ["flowId"],
      referencedParents: [{ kind: "flow", resourceId: "f9" }],
      tx: tx as never,
    })

    const tombstoneChecks = calls.filter((where) => "uninstallOutcome" in where)
    expect(tombstoneChecks).toHaveLength(1)
    expect(tombstoneChecks[0]).toMatchObject({
      resourceKind: "flow",
      resourceId: { in: ["f9"] },
    })
    // r1 is not installed: the permission check is skipped for it.
    expect(calls.some((where) => "allowEdit" in where)).toBe(false)
  })
})

describe("withDeleteGuard", () => {
  test("a plain resource: one lookup, then the delete runs in the same transaction", async () => {
    const { withDeleteGuard } = await import(
      "../src/template/installed-resource.service"
    )
    const tx = {
      execute: vi.fn(),
      query: {
        templateInstalledResourceModel: { findMany: vi.fn(async () => []) },
      },
    }
    const run = vi.fn(async () => "deleted")

    await expect(
      withDeleteGuard(
        {
          workspaceId: "ws-1",
          targets: [{ resourceKind: "flow", resourceIds: ["f1"] }],
          tx: tx as never,
        },
        run,
      ),
    ).resolves.toBe("deleted")

    expect(run).toHaveBeenCalledWith(tx)
    expect(
      tx.query.templateInstalledResourceModel.findMany,
    ).toHaveBeenCalledTimes(1)
    expect(tx.execute).not.toHaveBeenCalled()
  })

  test("an installed copy that disallows deletion is locked first, then refused without running the delete", async () => {
    const { withDeleteGuard } = await import(
      "../src/template/installed-resource.service"
    )
    const order: string[] = []
    const tx = {
      execute: vi.fn(() => {
        order.push("lock")
      }),
      query: {
        templateInstalledResourceModel: {
          findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
            if (where.OR) {
              order.push("live")
              return [{ resourceKind: "flow", resourceId: "f1" }]
            }
            order.push("blocking")
            return [{ resourceId: "f1" }]
          }),
        },
      },
    }
    const run = vi.fn()

    await expect(
      withDeleteGuard(
        {
          workspaceId: "ws-1",
          targets: [{ resourceKind: "flow", resourceIds: ["f1"] }],
          tx: tx as never,
        },
        run,
      ),
    ).rejects.toMatchObject({ code: "templateAllowDeleteViolation" })

    expect(order).toEqual(["live", "lock", "blocking"])
    expect(run).not.toHaveBeenCalled()
  })
})
