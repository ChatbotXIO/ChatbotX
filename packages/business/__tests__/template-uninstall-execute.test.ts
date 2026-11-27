// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listTombstones: vi.fn(),
  renewLease: vi.fn(),
  setOutcomes: vi.fn(),
  countOutcomes: vi.fn(),
  finalize: vi.fn(),
  operationIdOf: vi.fn(),
  finalizeOperation: vi.fn(),
  listPendingEffects: vi.fn(),
  clearEffects: vi.fn(),
  cancelPendingSyncs: vi.fn(),
  listInstalled: vi.fn(),
  uninstallDelete: vi.fn(),
  drain: vi.fn(),
  runEffects: vi.fn(),
  findInstallRoots: vi.fn(),
  dependents: vi.fn(),
  unfreeze: vi.fn(),
  markDeleteCommitted: vi.fn(),
  addWarning: vi.fn(),
  lockParents: vi.fn(),
  bumpEffectAttempts: vi.fn(),
  release: vi.fn(),
  deleteFolderIfEmpty: vi.fn(),
  acquireLocks: vi.fn(),
  undecided: vi.fn(),
  decideUninstall: vi.fn(),
  findInstallation: vi.fn(),
  claimRow: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (callback: (client: unknown) => unknown) => callback({}),
  },
}))
vi.mock("@chatbotx.io/database/statement-timeout", () => ({
  setLocalStatementTimeout: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationRepository: {
    findByIdAndWorkspace: mocks.findInstallation,
    lockInstallRequest: vi.fn(),
  },
  templateInstallationSyncRepository: {
    listInstalledResources: mocks.listInstalled,
    cancelPendingSyncs: mocks.cancelPendingSyncs,
  },
  templateUninstallStateRepository: {
    listTombstones: mocks.listTombstones,
    renewLease: mocks.renewLease,
    setOutcomes: mocks.setOutcomes,
    countOutcomes: mocks.countOutcomes,
    finalize: mocks.finalize,
    operationIdOf: mocks.operationIdOf,
    finalizeOperationIfComplete: mocks.finalizeOperation,
    listPendingEffects: mocks.listPendingEffects,
    clearEffects: mocks.clearEffects,
    findInstallRoots: mocks.findInstallRoots,
    bumpEffectAttempts: mocks.bumpEffectAttempts,
    markDeleteCommitted: mocks.markDeleteCommitted,
    addInstallationWarning: mocks.addWarning,
    release: mocks.release,
    claim: mocks.claimRow,
    deleteFolderIfEmpty: mocks.deleteFolderIfEmpty,
  },
}))
vi.mock("../src/template/template-resource-locks", () => ({
  acquireTemplateResourceLocks: mocks.acquireLocks,
  withTemplateLockedTransaction: async (
    callback: (tx: unknown) => Promise<unknown>,
    options: { prepare?: (tx: unknown) => Promise<void> },
  ) => {
    await options.prepare?.({})
    return await callback({})
  },
}))
vi.mock("../src/template/adapters/registry", () => ({
  TEMPLATE_INSTALL_ORDER: ["flows", "triggers"],
}))
vi.mock("../src/template/adapters/uninstall-handlers", () => ({
  UNINSTALL_HANDLER_BY_KIND: {
    flow: {
      heavyChildren: [],
      uninstallDelete: mocks.uninstallDelete,
      drainHeavyChildren: mocks.drain,
      protectedDependents: mocks.dependents,
      unfreeze: mocks.unfreeze,
    },
    trigger: {
      heavyChildren: [],
      uninstallDelete: mocks.uninstallDelete,
      protectedDependents: mocks.dependents,
      unfreeze: mocks.unfreeze,
    },
  },
}))
vi.mock("../src/template/uninstall-effect-runners", () => ({}))
vi.mock("../src/template/uninstall-parent-locks", () => ({
  lockParentRows: mocks.lockParents,
}))
vi.mock("../src/template/uninstall-effects", () => ({
  runUninstallEffects: mocks.runEffects,
}))
vi.mock("../src/template/uninstall-decide", () => ({
  assertNoRunningSync: vi.fn(),
  decideUninstall: mocks.decideUninstall,
  lockKeysOf: (rows: { resourceKind: string; resourceId: string }[]) =>
    rows.map((row) => ({ kind: row.resourceKind, resourceId: row.resourceId })),
  persistDecisions: vi.fn(),
  undecidedRows: mocks.undecided,
}))

const { templateUninstallExecuteService, TemplateUninstallClaimLostError } =
  await import("../src/template/uninstall-execute.service")

const claim = { id: "i1", token: "tok", workspaceId: "w1" }
const tomb = (
  id: string,
  kind: string,
  category: string,
  outcome = "deleting",
) => ({
  id: `row-${id}`,
  resourceId: id,
  resourceKind: kind,
  category,
  uninstallOutcome: outcome,
})

/** The tombstones left shrink as outcomes are written, like the real table. */
const tombstoneStore = (rows: ReturnType<typeof tomb>[]) => {
  let live: Record<string, unknown>[] = [...rows]
  mocks.listTombstones.mockImplementation(() => Promise.resolve([...live]))
  const markCommitted = (ids: string[]) => {
    live = live.map((row) =>
      ids.includes(row.id as string) && !row.uninstallDrainStartedAt
        ? { ...row, uninstallDrainStartedAt: new Date() }
        : row,
    )
  }
  mocks.markDeleteCommitted.mockImplementation((ids: string[]) => {
    markCommitted(ids)
    return Promise.resolve()
  })
  mocks.setOutcomes.mockImplementation(({ ids }: { ids: string[] }) => {
    live = live.filter((row) => !ids.includes(row.id))
    return Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.renewLease.mockResolvedValue(true)
  mocks.finalize.mockResolvedValue(true)
  mocks.operationIdOf.mockResolvedValue("op1")
  mocks.countOutcomes.mockResolvedValue({
    failed: 0,
    deleted: 2,
    blockedByReference: 0,
  })
  mocks.listPendingEffects.mockResolvedValue([])
  mocks.listInstalled.mockResolvedValue([])
  mocks.undecided.mockReturnValue([])
  mocks.findInstallation.mockResolvedValue(null)
  mocks.decideUninstall.mockResolvedValue([])
  mocks.uninstallDelete.mockImplementation((_tx: unknown, ids: string[]) =>
    Promise.resolve({ deleted: ids, absent: [], effects: new Map() }),
  )
  mocks.drain.mockResolvedValue(false)
  mocks.bumpEffectAttempts.mockResolvedValue([])
  mocks.unfreeze.mockResolvedValue(new Map())
  mocks.dependents.mockResolvedValue(new Set())
  mocks.findInstallRoots.mockResolvedValue([])
  mocks.deleteFolderIfEmpty.mockResolvedValue("notEmpty")
})

describe("Phase B (drain and delete)", () => {
  test("deletes dependents before parents, persists each outcome, finalizes done, and closes the operation", async () => {
    tombstoneStore([
      tomb("1", "flow", "flows"),
      tomb("2", "trigger", "triggers"),
    ])
    const order: string[] = []
    mocks.uninstallDelete.mockImplementation(
      (_tx: unknown, ids: string[], ctx: { kind: string }) => {
        order.push(ctx.kind)
        return Promise.resolve({ deleted: ids, absent: [], effects: new Map() })
      },
    )

    await templateUninstallExecuteService.run(claim)

    expect(order).toEqual(["trigger", "flow"])
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ state: "done", token: "tok" }),
      expect.anything(),
    )
    expect(mocks.finalizeOperation).toHaveBeenCalledWith(
      "op1",
      expect.anything(),
    )
    expect(mocks.cancelPendingSyncs).toHaveBeenCalled()
  })

  test("a modified copy ends as deletedModified, absent rows as absent", async () => {
    tombstoneStore([tomb("1", "flow", "flows", "deletingModified")])
    mocks.uninstallDelete.mockResolvedValue({
      deleted: ["1"],
      absent: [],
      effects: new Map(),
    })

    await templateUninstallExecuteService.run(claim)

    expect(mocks.setOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "deletedModified", detach: true }),
      expect.anything(),
    )
  })

  test("heavy children drain in rounds before the parent is deleted", async () => {
    tombstoneStore([tomb("1", "flow", "flows")])
    mocks.drain.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await templateUninstallExecuteService.run(claim)

    expect(mocks.drain).toHaveBeenCalledTimes(2)
    expect(mocks.uninstallDelete).toHaveBeenCalledTimes(1)
  })

  test("a failing batch marks its rows failed and the run ends partial", async () => {
    tombstoneStore([tomb("1", "flow", "flows")])
    mocks.uninstallDelete.mockRejectedValue(new Error("boom"))
    mocks.countOutcomes.mockResolvedValue({
      failed: 1,
      deleted: 0,
      blockedByReference: 0,
    })

    await templateUninstallExecuteService.run(claim)

    expect(mocks.setOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed" }),
      expect.anything(),
    )
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ state: "partial" }),
      expect.anything(),
    )
  })

  test("a stale worker is fenced: the lease renewal fails, nothing is deleted or finalized", async () => {
    tombstoneStore([tomb("1", "flow", "flows")])
    mocks.renewLease.mockResolvedValue(false)

    await expect(
      templateUninstallExecuteService.run(claim),
    ).rejects.toBeInstanceOf(TemplateUninstallClaimLostError)
    expect(mocks.uninstallDelete).not.toHaveBeenCalled()
    expect(mocks.finalize).not.toHaveBeenCalled()
  })

  test("a stale worker can not finalize: the fenced transition updates no row", async () => {
    tombstoneStore([])
    mocks.finalize.mockResolvedValue(false)

    await expect(
      templateUninstallExecuteService.run(claim),
    ).rejects.toBeInstanceOf(TemplateUninstallClaimLostError)
    expect(mocks.finalizeOperation).not.toHaveBeenCalled()
  })

  test("a crash after a partial batch resumes from the persisted outcomes with exact counts", async () => {
    // Only the second flow is still tombstoned: the first was already finished.
    tombstoneStore([tomb("2", "flow", "flows")])

    await templateUninstallExecuteService.run(claim)

    expect(mocks.uninstallDelete).toHaveBeenCalledTimes(1)
    expect(mocks.countOutcomes).toHaveBeenCalledWith("i1", expect.anything())
  })
})

describe("the install folder", () => {
  const folder = { folderId: "f9", workspaceId: "w1", trackedRowId: "row-f9" }

  test("is deleted last when the deletes left it empty, and its tracked row follows", async () => {
    tombstoneStore([tomb("1", "flow", "flows")])
    mocks.findInstallRoots.mockResolvedValue([folder])
    mocks.deleteFolderIfEmpty.mockResolvedValue("deleted")

    await templateUninstallExecuteService.run(claim)

    expect(mocks.deleteFolderIfEmpty).toHaveBeenCalledWith(
      { workspaceId: "w1", folderId: "f9" },
      expect.anything(),
    )
    expect(mocks.setOutcomes).toHaveBeenLastCalledWith(
      expect.objectContaining({ ids: ["row-f9"], outcome: "deleted" }),
      expect.anything(),
    )
  })

  test("is kept (still counted as kept) when something is left in it", async () => {
    tombstoneStore([])
    mocks.findInstallRoots.mockResolvedValue([folder])
    mocks.deleteFolderIfEmpty.mockResolvedValue("notEmpty")

    await templateUninstallExecuteService.run(claim)

    expect(mocks.setOutcomes).not.toHaveBeenCalled()
    expect(mocks.finalize).toHaveBeenCalled()
  })

  test("is left alone when a delete failed (a retry will look again)", async () => {
    tombstoneStore([])
    mocks.findInstallRoots.mockResolvedValue([folder])
    mocks.countOutcomes.mockResolvedValue({
      failed: 1,
      deleted: 0,
      blockedByReference: 0,
    })

    await templateUninstallExecuteService.run(claim)

    expect(mocks.deleteFolderIfEmpty).not.toHaveBeenCalled()
  })
})

describe("retry keeps the edited flag", () => {
  test("a failed edited copy is stored as failedModified, not plain failed", async () => {
    tombstoneStore([tomb("1", "flow", "flows", "deletingModified")])
    mocks.uninstallDelete.mockRejectedValue(new Error("boom"))
    mocks.countOutcomes.mockResolvedValue({
      failed: 1,
      deleted: 0,
      blockedByReference: 0,
    })

    await templateUninstallExecuteService.run(claim)

    expect(mocks.setOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failedModified" }),
      expect.anything(),
    )
  })
})

describe("post-commit effects", () => {
  test("run after commit and are cleared once done", async () => {
    tombstoneStore([])
    mocks.listPendingEffects.mockResolvedValue([
      { id: "row-1", effects: [{ name: "x", args: {} }] },
    ])
    mocks.runEffects.mockResolvedValue(true)

    await templateUninstallExecuteService.run(claim)

    expect(mocks.clearEffects).toHaveBeenCalledWith(["row-1"])
  })

  test("a failing effect stays recorded for the sweep", async () => {
    tombstoneStore([])
    mocks.listPendingEffects.mockResolvedValue([
      { id: "row-1", effects: [{ name: "x", args: {} }] },
    ])
    mocks.runEffects.mockResolvedValue(false)

    await templateUninstallExecuteService.run(claim)

    expect(mocks.clearEffects).not.toHaveBeenCalled()
  })
})

describe("effects that keep failing", () => {
  test("count an attempt, and a row at the limit is dropped and cleared (never retried forever)", async () => {
    tombstoneStore([])
    mocks.listPendingEffects.mockResolvedValue([
      { id: "row-1", effects: [{ name: "x", args: {} }] },
    ])
    mocks.runEffects.mockResolvedValue(false)
    mocks.bumpEffectAttempts.mockResolvedValue(["row-1"])

    await templateUninstallExecuteService.run(claim)

    expect(mocks.bumpEffectAttempts).toHaveBeenCalledWith(["row-1"])
    expect(mocks.clearEffects).toHaveBeenCalledWith(["row-1"])
  })
})

describe("the round budget", () => {
  test("running out with tombstones left releases the claim and never finalizes done", async () => {
    // Every round drains "more": the parent is never reached.
    tombstoneStore([tomb("1", "flow", "flows")])
    mocks.drain.mockResolvedValue(true)

    await templateUninstallExecuteService.run(claim)

    expect(mocks.finalize).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledWith(
      expect.objectContaining({ id: "i1", token: "tok" }),
    )
  })
})

describe("references that arrive after the decision (a retry, or one that slipped through)", () => {
  test("a row something outside the deleting set points at is kept, not deleted", async () => {
    tombstoneStore([
      tomb("1", "flow", "flows"),
      tomb("2", "trigger", "triggers"),
    ])
    mocks.dependents.mockImplementation((_tx: unknown, ids: string[]) =>
      Promise.resolve(new Set(ids.filter((id) => id === "1"))),
    )

    await templateUninstallExecuteService.run(claim)

    expect(mocks.setOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ["row-1"],
        outcome: "keptHasDependents",
        detach: true,
      }),
      expect.anything(),
    )
    expect(mocks.uninstallDelete).toHaveBeenCalledTimes(1)
  })
})

describe("unverified copies keep their flag through a failure", () => {
  test("a failed unverifiable copy is stored as failedUnverified", async () => {
    tombstoneStore([tomb("1", "flow", "flows", "deletingUnverified")])
    mocks.uninstallDelete.mockRejectedValue(new Error("boom"))
    mocks.countOutcomes.mockResolvedValue({
      failed: 1,
      deleted: 0,
      blockedByReference: 0,
    })

    await templateUninstallExecuteService.run(claim)

    expect(mocks.setOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failedUnverified" }),
      expect.anything(),
    )
  })
})

describe("the decision is taken once, before any drain", () => {
  test("the parent rows are locked in the batch before anything is probed or deleted", async () => {
    tombstoneStore([tomb("1", "flow", "flows")])

    await templateUninstallExecuteService.run(claim)

    expect(mocks.lockParents).toHaveBeenCalledWith(
      expect.anything(),
      "w1",
      expect.arrayContaining([
        expect.objectContaining({ resourceKind: "flow", resourceId: "1" }),
      ]),
    )
  })

  test("a kept row gets its producers back from the stored values", async () => {
    tombstoneStore([tomb("1", "flow", "flows")])
    mocks.dependents.mockResolvedValue(new Set(["1"]))

    await templateUninstallExecuteService.run(claim)

    expect(mocks.unfreeze).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ resourceId: "1" })],
      expect.objectContaining({ kind: "flow", workspaceId: "w1" }),
    )
  })

  test("the first drained batch marks the row: it can no longer be kept", async () => {
    tombstoneStore([tomb("1", "flow", "flows")])
    mocks.drain.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await templateUninstallExecuteService.run(claim)

    expect(mocks.markDeleteCommitted).toHaveBeenCalledWith(
      ["row-1"],
      expect.anything(),
    )
  })

  test("a committed row a holder now points at is blocked at the parent delete: not deleted, not kept, not unfrozen", async () => {
    const committed = {
      ...tomb("1", "flow", "flows"),
      uninstallDrainStartedAt: new Date(),
    }
    tombstoneStore([committed])
    mocks.dependents.mockResolvedValue(new Set(["1"]))

    await templateUninstallExecuteService.run(claim)

    expect(mocks.unfreeze).not.toHaveBeenCalled()
    expect(mocks.uninstallDelete).not.toHaveBeenCalled()
    expect(mocks.setOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ["row-1"],
        outcome: "blockedByReference",
      }),
      expect.anything(),
    )
    expect(mocks.setOutcomes).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "keptHasDependents" }),
      expect.anything(),
    )
    expect(mocks.finalize).toHaveBeenCalled()
  })

  test("a row is committed to deletion (the point of no return) before anything is drained", async () => {
    tombstoneStore([tomb("1", "flow", "flows")])
    const order: string[] = []
    const markThrough = mocks.markDeleteCommitted.getMockImplementation()
    mocks.markDeleteCommitted.mockImplementation((ids: string[]) => {
      order.push("commit")
      return markThrough?.(ids)
    })
    mocks.drain.mockImplementation(() => {
      order.push("drain")
      return Promise.resolve(false)
    })

    await templateUninstallExecuteService.run(claim)

    expect(order).toEqual(["commit", "drain"])
  })

  test("a row a holder reaches at the point of no return is kept whole and NOT committed", async () => {
    tombstoneStore([tomb("1", "flow", "flows")])
    mocks.dependents.mockResolvedValue(new Set(["1"]))

    await templateUninstallExecuteService.run(claim)

    expect(mocks.markDeleteCommitted).toHaveBeenCalledWith(
      [],
      expect.anything(),
    )
    expect(mocks.drain).not.toHaveBeenCalled()
    expect(mocks.unfreeze).toHaveBeenCalledTimes(1)
  })

  test("a drained row with no holder is deleted without a second keep decision", async () => {
    const drained = {
      ...tomb("1", "flow", "flows"),
      uninstallDrainStartedAt: new Date(),
    }
    tombstoneStore([drained])

    await templateUninstallExecuteService.run(claim)

    expect(mocks.uninstallDelete).toHaveBeenCalledTimes(1)
    // Probed once, at the delete (the keep decision skipped it).
    expect(mocks.dependents).toHaveBeenCalledTimes(1)
  })
})

describe("giving up on an effect", () => {
  test("puts a warning on the installation, not only in the log", async () => {
    tombstoneStore([])
    mocks.listPendingEffects.mockResolvedValue([
      { id: "row-1", effects: [{ name: "x", args: {} }] },
    ])
    mocks.runEffects.mockResolvedValue(false)
    mocks.bumpEffectAttempts.mockResolvedValue(["row-1"])

    await templateUninstallExecuteService.run(claim)

    expect(mocks.addWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: "i1",
        warning: expect.objectContaining({ entityKind: "uninstallEffect" }),
      }),
    )
  })
})

describe("Phase A locks what it will tombstone", () => {
  test("takes the tpl-res locks of the re-read rows before deciding anything", async () => {
    const row = { resourceKind: "flow", resourceId: "1" }
    mocks.listInstalled.mockResolvedValue([row])
    mocks.undecided.mockReturnValue([row])
    const order: string[] = []
    mocks.acquireLocks.mockImplementation(() => {
      order.push("acquire")
      return Promise.resolve()
    })
    mocks.decideUninstall.mockImplementation(() => {
      order.push("decide")
      return Promise.resolve([])
    })

    await templateUninstallExecuteService.decide(claim)

    expect(mocks.acquireLocks).toHaveBeenCalledWith({}, [
      { kind: "flow", resourceId: "1" },
    ])
    expect(order).toEqual(["acquire", "decide"])
  })

  test("a lock set that grew aborts the decision before it tombstones", async () => {
    const row = { resourceKind: "flow", resourceId: "1" }
    mocks.listInstalled.mockResolvedValue([row])
    mocks.undecided.mockReturnValue([row])
    mocks.acquireLocks.mockRejectedValue(new Error("grown"))

    await expect(templateUninstallExecuteService.decide(claim)).rejects.toThrow(
      "grown",
    )
    expect(mocks.decideUninstall).not.toHaveBeenCalled()
  })
})

describe("the claim", () => {
  test("is taken for the workspace the job names, not checked afterwards", async () => {
    mocks.claimRow.mockResolvedValue({ id: "i1", workspaceId: "w1" })

    const claimed = await templateUninstallExecuteService.claim({
      installationId: "i1",
      workspaceId: "w1",
    })

    expect(mocks.claimRow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "i1", workspaceId: "w1" }),
    )
    expect(claimed?.id).toBe("i1")
    mocks.claimRow.mockResolvedValue(null)
    expect(
      await templateUninstallExecuteService.claim({
        installationId: "i1",
        workspaceId: "other",
      }),
    ).toBeNull()
  })
})

describe("a permanent failure", () => {
  test("marks only the failing kind failed and is rethrown, so the worker can close the uninstall", async () => {
    tombstoneStore([
      { ...tomb("1", "flow", "flows"), uninstallDrainStartedAt: new Date() },
      {
        ...tomb("9", "calendar", "calendars"),
        uninstallDrainStartedAt: new Date(),
      },
    ])
    mocks.uninstallDelete.mockRejectedValue(new Error("not reached"))

    await expect(
      templateUninstallExecuteService.run(claim),
    ).rejects.toMatchObject({ code: "templateUninstallNoHandler" })

    const failed = mocks.setOutcomes.mock.calls
      .map(([input]) => input as { ids: string[]; outcome: string })
      .filter((input) => input.outcome === "failed")
    expect(failed.flatMap((input) => input.ids)).toEqual(["row-9"])
  })
})
