import { type DatabaseClient, db } from "../../client"
import type { TemplateResourceKind } from "../../partials/template"
import { keepKnownResourceKinds } from "./kinds"

/** The permission a lock check is about: `allowEdit` for content writes, `allowDelete` for deletes. */
export type TemplateResourcePermission = "allowEdit" | "allowDelete"

// Deliberately a relational query (no schema or drizzle-operator imports): this
// repository sits behind the guards every resource service imports, and a
// plain `db` dependency keeps those services importable under test mocks.
export const templateInstalledResourceRepository = {
  /**
   * The ids, among `resourceIds`, that a template-installed copy currently
   * locks against `permission` — one statement however many ids are checked. A
   * copy governs a resource only while it is active:
   * - `wasExisting = false` — a reused row was the installer's before the
   *   install and is never locked by it;
   * - not detached — the template dropped the item;
   * - the source template still exists (`sourceDeletedAt IS NULL` and a
   *   non-null `templateId`, which a hard delete clears) — deleting
   *   the template unlocks everything it installed.
   * With several installations pointing at one resource the most restrictive
   * wins: any one locking row is enough.
   */
  async findBlocking(
    input: {
      workspaceId: string
      resourceKind: TemplateResourceKind
      resourceIds: readonly string[]
      permission: TemplateResourcePermission
      /** An uninstall rules out its own installations: they stop governing once it commits. */
      excludeInstallationIds?: readonly string[]
    },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (input.resourceIds.length === 0) {
      return []
    }
    const rows = await tx.query.templateInstalledResourceModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        resourceKind: input.resourceKind,
        resourceId: { in: [...input.resourceIds] },
        wasExisting: false,
        detachedAt: { isNull: true as const },
        [input.permission]: false,
        ...(input.excludeInstallationIds?.length
          ? { installationId: { notIn: [...input.excludeInstallationIds] } }
          : {}),
        installation: {
          sourceDeletedAt: { isNull: true as const },
          // `templateId` is nulled when the source template is hard-deleted.
          templateId: { isNotNull: true as const },
        },
      },
      columns: { resourceId: true },
    })
    return [...new Set(rows.map((row) => row.resourceId))]
  },

  /**
   * The `(kind, id)` keys, among `keys`, that have a live (not detached, not
   * reused) provenance row, across several kinds in ONE statement: the
   * index-only lookup that decides whether a writer must take the `tpl-res:`
   * locks at all. This is the only query a
   * guarded write on a resource nobody installed pays.
   */
  async findLiveKeys(
    input: {
      workspaceId: string
      keys: readonly { kind: TemplateResourceKind; resourceId: string }[]
    },
    tx: DatabaseClient = db,
  ): Promise<{ kind: TemplateResourceKind; resourceId: string }[]> {
    if (input.keys.length === 0) {
      return []
    }
    const idsByKind = new Map<TemplateResourceKind, string[]>()
    for (const key of input.keys) {
      idsByKind.set(key.kind, [
        ...(idsByKind.get(key.kind) ?? []),
        key.resourceId,
      ])
    }
    const rows = await tx.query.templateInstalledResourceModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        wasExisting: false,
        detachedAt: { isNull: true as const },
        OR: [...idsByKind].map(([resourceKind, resourceIds]) => ({
          resourceKind,
          resourceId: { in: resourceIds },
        })),
      },
      columns: { resourceKind: true, resourceId: true },
    })
    const live = new Set(
      rows.map((row) => `${row.resourceKind}\u0000${row.resourceId}`),
    )
    return input.keys.filter((key) =>
      live.has(`${key.kind}\u0000${key.resourceId}`),
    )
  },

  /**
   * One keyset page of an installation's tracked resources, by id. Fetches
   * `limit + 1` to tell whether another page exists (`nextCursor`).
   */
  async listPage(
    input: {
      installationId: string
      workspaceId: string
      afterId?: string
      limit: number
    },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx.query.templateInstalledResourceModel.findMany({
      where: {
        installationId: input.installationId,
        workspaceId: input.workspaceId,
        ...(input.afterId ? { id: { gt: input.afterId } } : {}),
      },
      orderBy: { id: "asc" },
      limit: input.limit + 1,
      columns: {
        id: true,
        category: true,
        resourceKind: true,
        resourceId: true,
        wasExisting: true,
        allowEdit: true,
        allowDelete: true,
        detachedAt: true,
      },
    })
    // The cursor comes from the raw page, so an unknown kind is dropped from
    // the rows without ending pagination early.
    const page = rows.slice(0, input.limit)
    return {
      rows: keepKnownResourceKinds(page),
      nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
    }
  },
}
