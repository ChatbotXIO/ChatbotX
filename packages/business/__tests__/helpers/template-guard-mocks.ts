/**
 * Pass-through stand-ins for the guard helpers of
 * `src/template/installed-resource.service` (`withDeleteGuard`,
 * `withEditGuard`, `isTemplateInstalled`), for service tests that mock that
 * module. Each one reproduces the helper's shape on the test's own mocks: the
 * delete guard reports to the test's `assertDeletable` mock and runs the write
 * on the mocked client, the edit guard runs on the (mocked)
 * `withTemplateLockedTransaction` and reports to `assertResourceEditable`.
 *
 * Usage inside `vi.mock("../src/template/installed-resource.service", async () => ({ ..., ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({ assertDeletable, assertResourceEditable }) }))`.
 */
import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import type { TemplateLockKey } from "../../src/template/template-resource-locks"

type GuardCall = (input: unknown) => unknown

type DeleteGuardInput = {
  workspaceId: string
  targets: readonly {
    resourceKind: TemplateResourceKind
    resourceIds: readonly string[]
  }[]
  tx?: unknown
  excludeInstallationIds?: readonly string[]
}

type EditGuardInput = {
  workspaceId: string
  resourceKind: TemplateResourceKind
  resourceId: string
  referencedParents?: readonly TemplateLockKey[]
  load: (tx: DatabaseClient) => Promise<unknown>
  changedKeys: (loaded: unknown) => readonly string[]
  write: (tx: DatabaseClient, loaded: unknown) => Promise<unknown>
}

export const templateGuardMocks = (hooks: {
  assertDeletable?: GuardCall
  assertResourceEditable?: GuardCall
  /** The service deletes inside `db.transaction(...)`: run the write on that handle. */
  useTransaction?: boolean
}) => ({
  // Handed back so the module mock exports the SAME functions the helper reports to.
  ...(hooks.assertDeletable ? { assertDeletable: hooks.assertDeletable } : {}),
  ...(hooks.assertResourceEditable
    ? { assertResourceEditable: hooks.assertResourceEditable }
    : {}),
  withDeleteGuard: async (
    input: DeleteGuardInput,
    run: (tx: unknown) => unknown,
  ) => {
    for (const target of input.targets) {
      await hooks.assertDeletable?.({
        workspaceId: input.workspaceId,
        resourceKind: target.resourceKind,
        resourceIds: target.resourceIds,
        tx: input.tx,
        excludeInstallationIds: input.excludeInstallationIds,
      })
    }
    if (input.tx) {
      return await run(input.tx)
    }
    const { db } = await import("@chatbotx.io/database/client")
    return hooks.useTransaction
      ? await db.transaction((tx) => run(tx))
      : await run(db)
  },
  withEditGuard: async (input: EditGuardInput) => {
    const { withTemplateLockedTransaction } = await import(
      "../../src/template/template-resource-locks"
    )
    return await withTemplateLockedTransaction(
      async (tx) => {
        const loaded = await input.load(tx)
        await hooks.assertResourceEditable?.({
          workspaceId: input.workspaceId,
          resourceKind: input.resourceKind,
          resourceIds: [input.resourceId],
          changedKeys: input.changedKeys(loaded),
          referencedParents: input.referencedParents,
          tx,
        })
        return await input.write(tx, loaded)
      },
      {
        workspaceId: input.workspaceId,
        initialKeys: [
          { kind: input.resourceKind, resourceId: input.resourceId },
          ...(input.referencedParents ?? []),
        ],
      },
    )
  },
  isTemplateInstalled: async () => false,
})

type LiveLookupWhere = {
  OR?: { resourceKind: string; resourceId: { in: string[] } }[]
}

/**
 * `tx.query.templateInstalledResourceModel` for service tests that run the REAL
 * lock/guard code against a mocked client: it answers the live-key lookup (the
 * query that carries an `OR`) with `liveKeys` (default: every requested key is
 * installed, so the lock path runs) and every other provenance query (tombstone,
 * blocking) with nothing.
 */
export const installedResourceModelStub = (
  liveKeys: "all" | readonly { kind: string; resourceId: string }[] = "all",
) => ({
  findMany: async ({ where }: { where: LiveLookupWhere }) =>
    (where.OR ?? []).flatMap((clause) =>
      clause.resourceId.in
        .filter(
          (resourceId) =>
            liveKeys === "all" ||
            liveKeys.some(
              (key) =>
                key.kind === clause.resourceKind &&
                key.resourceId === resourceId,
            ),
        )
        .map((resourceId) => ({
          resourceKind: clause.resourceKind,
          resourceId,
        })),
    ),
})
