// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  blockedByOthers: vi.fn(),
  dependents: vi.fn(),
  setOutcomes: vi.fn(),
  freeze: vi.fn(),
  updatable: vi.fn(),
  setFrozenFrom: vi.fn(),
  setEffects: vi.fn(),
  freezeEffects: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationSyncRepository: {
    hasRunningSync: vi.fn().mockResolvedValue(false),
  },
  templateUninstallRepository: {
    findDeleteBlockedByOthers: mocks.blockedByOthers,
  },
  templateUninstallStateRepository: {
    setOutcomes: mocks.setOutcomes,
    setFrozenFrom: mocks.setFrozenFrom,
    setEffects: mocks.setEffects,
  },
}))
vi.mock("../src/template/adapters/registry", () => ({
  getTemplateAdapter: (category: string) => ({
    trackedKind: category === "flows" ? "flow" : "trigger",
    sync: {
      project: mocks.project,
      get updatable() {
        return mocks.updatable()
      },
    },
  }),
}))
vi.mock("../src/template/adapters/uninstall-handlers", () => {
  const handler = {
    heavyChildren: [],
    freeze: mocks.freeze,
    freezeEffects: mocks.freezeEffects,
    protectedDependents: mocks.dependents,
    uninstallDelete: vi.fn(),
  }
  return {
    UNINSTALL_HANDLER_BY_KIND: { flow: handler, trigger: handler },
  }
})

const { hashCanonical } = await import("../src/template/payload-hash")
const {
  decideUninstall,
  countDecisions,
  persistDecisions,
  lockKeysOf,
  assertPublisherStillAllowed,
} = await import("../src/template/uninstall-decide")

const unmodified = { name: "same" }
const row = (overrides: Record<string, unknown>) => ({
  id: `row-${overrides.resourceId}`,
  category: "flows",
  resourceKind: "flow",
  resourceId: "1",
  wasExisting: false,
  detachedAt: null,
  uninstallOutcome: null,
  syncedHash: null,
  ...overrides,
})

const decide = async (rows: ReturnType<typeof row>[]) =>
  await decideUninstall({} as never, {
    installationId: "i1",
    workspaceId: "w1",
    rows: rows as never,
  })

const outcomes = (decisions: Awaited<ReturnType<typeof decide>>) =>
  Object.fromEntries(
    decisions.map(({ row: entry, outcome }) => [entry.resourceId, outcome]),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue(unmodified)
  mocks.blockedByOthers.mockResolvedValue(new Set())
  mocks.dependents.mockResolvedValue(new Set())
  mocks.updatable.mockReturnValue(undefined)
  mocks.freeze.mockImplementation((_tx: unknown, ids: string[]) =>
    Promise.resolve(new Map(ids.map((id) => [id, { active: true }]))),
  )
})

describe("uninstall decision (Phase A)", () => {
  test("an unmodified copy is deleted", async () => {
    const hash = await hashCanonical(unmodified)
    const decisions = await decide([row({ resourceId: "1", syncedHash: hash })])
    expect(outcomes(decisions)).toEqual({ 1: "deleting" })
  })

  test("an edited copy is deleted too, and counted as deletedModified", async () => {
    mocks.project.mockResolvedValue({ name: "edited" })
    const hash = await hashCanonical(unmodified)
    const decisions = await decide([row({ resourceId: "1", syncedHash: hash })])
    expect(outcomes(decisions)).toEqual({ 1: "deletingModified" })
    expect(countDecisions(decisions)).toMatchObject({
      deleted: 1,
      deletedModified: 1,
    })
  })

  test("a copy with no baseline hash is deleted and counted as unverified, never claimed as edited", async () => {
    const decisions = await decide([row({ resourceId: "1", syncedHash: null })])
    expect(outcomes(decisions)).toEqual({ 1: "deletingUnverified" })
    expect(countDecisions(decisions)).toMatchObject({
      deleted: 1,
      deletedModified: 0,
      deletedUnverified: 1,
    })
  })

  test("a kind with no fingerprint (updateNotSupported) is unverified too", async () => {
    mocks.updatable.mockReturnValue(false)
    const decisions = await decide([row({ resourceId: "1", syncedHash: "x" })])
    expect(outcomes(decisions)).toEqual({ 1: "deletingUnverified" })
  })

  test("a copy with nothing to project is still deleted, as unverified (the delete reports absent if the row is gone)", async () => {
    mocks.project.mockResolvedValue(null)
    expect(outcomes(await decide([row({ resourceId: "1" })]))).toEqual({
      1: "deletingUnverified",
    })
  })

  test("manifests are kept shared, reused items are never touched", async () => {
    const decisions = await decide([
      row({ resourceId: "t1", resourceKind: "tag", category: "settings" }),
      row({ resourceId: "f2", wasExisting: true }),
      row({ resourceId: "f3", detachedAt: new Date() }),
    ])
    expect(outcomes(decisions)).toEqual({ t1: "keptShared" })
  })

  test("a copy another installation locks is kept (keptLockedByOther)", async () => {
    mocks.blockedByOthers.mockResolvedValue(new Set(["1"]))
    expect(outcomes(await decide([row({ resourceId: "1" })]))).toEqual({
      1: "keptLockedByOther",
    })
  })

  test("a copy with a dependent outside the deleting set is kept, and keep propagates to its parent", async () => {
    // The trigger (2) is kept because the installer's own item uses it; the
    // flow (1) is then kept because the kept trigger still points at it.
    mocks.dependents.mockImplementation(
      (_tx: unknown, ids: string[], deleting: Set<string>) =>
        Promise.resolve(
          new Set(
            ids.filter(
              (id) =>
                (id === "2" && !deleting.has("flow:9")) ||
                (id === "1" && !deleting.has("trigger:2")),
            ),
          ),
        ),
    )
    const decisions = await decide([
      row({ resourceId: "1" }),
      row({ resourceId: "2", resourceKind: "trigger", category: "triggers" }),
    ])
    expect(outcomes(decisions)).toEqual({
      1: "keptHasDependents",
      2: "keptHasDependents",
    })
    expect(countDecisions(decisions).keptHasDependents).toBe(2)
  })

  test("a decided installation has nothing left to decide (a crash after Phase A resumes at B)", async () => {
    const decisions = await decide([
      row({ resourceId: "1", uninstallOutcome: "deleting" }),
      row({ resourceId: "2", uninstallOutcome: "keptShared" }),
    ])
    expect(decisions).toEqual([])
    expect(mocks.project).not.toHaveBeenCalled()
  })

  test("only copied resources are locked; manifests never are", () => {
    expect(
      lockKeysOf([
        row({ resourceId: "1" }),
        row({ resourceId: "t1", resourceKind: "tag", category: "settings" }),
      ] as never),
    ).toEqual([{ kind: "flow", resourceId: "1" }])
  })
})

describe("persisting Phase A", () => {
  test("kept and absent rows are detached, tombstones stay governed and their producers are frozen", async () => {
    const decisions = await decide([
      row({ resourceId: "1" }),
      row({ resourceId: "2", resourceKind: "trigger", category: "triggers" }),
    ])
    mocks.blockedByOthers.mockResolvedValue(new Set())
    await persistDecisions(
      {} as never,
      { workspaceId: "w1", installationId: "i1" },
      decisions,
    )
    for (const [input] of mocks.setOutcomes.mock.calls) {
      expect(input.detach).toBe(false)
    }
    expect(mocks.freeze).toHaveBeenCalledTimes(2)
    // Stored with the freeze, so a kept or cancelled copy gets its flag back.
    expect(mocks.setFrozenFrom).toHaveBeenCalledWith(
      [{ id: "row-1", flags: { active: true } }],
      expect.anything(),
    )
  })

  test("freezing a cached producer records its cache drop, to run right after Phase A commits", async () => {
    mocks.freezeEffects.mockImplementation((workspaceId: string) => [
      { name: "trigger.invalidateCache", args: { workspaceId } },
    ])
    const decisions = await decide([row({ resourceId: "1" })])

    await persistDecisions(
      {} as never,
      { workspaceId: "w1", installationId: "i1" },
      decisions,
    )

    expect(mocks.setEffects).toHaveBeenCalledWith(
      [
        {
          id: "row-1",
          effects: [
            { name: "trigger.invalidateCache", args: { workspaceId: "w1" } },
          ],
        },
      ],
      expect.anything(),
    )
  })

  test("a kept copy is detached in the same write as its outcome", async () => {
    await persistDecisions(
      {} as never,
      { workspaceId: "w1", installationId: "i1" },
      [{ row: row({ resourceId: "t1" }) as never, outcome: "keptShared" }],
    )
    expect(mocks.setOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "keptShared", detach: true }),
      expect.anything(),
    )
    expect(mocks.freeze).not.toHaveBeenCalled()
  })
})

describe("the publisher's grant at execution", () => {
  const tx = (template: unknown, workspace: unknown) =>
    ({
      query: {
        templateModel: { findFirst: vi.fn().mockResolvedValue(template) },
        workspaceModel: { findFirst: vi.fn().mockResolvedValue(workspace) },
      },
    }) as never
  const publisher = {
    uninstallRequestedByKind: "publisher",
    publisherUninstallGrant: 1,
    templateId: "t1",
    workspaceId: "w1",
  }

  test("an installer's own uninstall needs no grant", async () => {
    await expect(
      assertPublisherStillAllowed(tx(null, null), {
        ...publisher,
        uninstallRequestedByKind: "installer",
        publisherUninstallGrant: 0,
      }),
    ).resolves.toBeUndefined()
  })

  test("a revoked grant stops a publisher uninstall before anything is decided", async () => {
    await expect(
      assertPublisherStillAllowed(tx({ tenantId: "1" }, { tenantId: "1" }), {
        ...publisher,
        publisherUninstallGrant: 0,
      }),
    ).rejects.toMatchObject({ code: "templateUninstallNotGranted" })
  })

  test("a tenant that no longer matches stops it", async () => {
    await expect(
      assertPublisherStillAllowed(
        tx({ tenantId: "1" }, { tenantId: "2" }),
        publisher,
      ),
    ).rejects.toMatchObject({ code: "templateUninstallNotGranted" })
  })

  test("a deleted template stops it", async () => {
    await expect(
      assertPublisherStillAllowed(tx(undefined, { tenantId: "1" }), publisher),
    ).rejects.toMatchObject({ code: "templateUninstallNotGranted" })
  })

  test("a standing grant with matching tenants passes", async () => {
    await expect(
      assertPublisherStillAllowed(
        tx({ tenantId: "1" }, { tenantId: "1" }),
        publisher,
      ),
    ).resolves.toBeUndefined()
  })
})
