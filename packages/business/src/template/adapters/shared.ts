import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  TemplateCategory,
  TemplateResourceCategory,
  TemplateResourceKind,
} from "@chatbotx.io/database/partials"
import type { UnresolvedReference } from "@chatbotx.io/flow-config"
import { templateBackupNotRestorableException } from "../template-errors"
import type {
  PatchTask,
  ResourceCollector,
  ResourceSyncHandler,
  StagedObject,
  TemplateCollectResult,
  TemplateHardDependency,
  TemplateInstallContext,
} from "./types"

/**
 * What `collect` returns for an empty id list. Frozen: one shared instance is
 * handed to every adapter, so a consumer that tried to push into it would
 * corrupt every other category's result.
 */
export const EMPTY_COLLECT_RESULT: TemplateCollectResult = Object.freeze({
  entries: Object.freeze([]),
  folderIds: Object.freeze([]) as readonly string[],
  productCategoryIds: Object.freeze([]) as readonly string[],
  hardDependencies: Object.freeze(
    [],
  ) as TemplateCollectResult["hardDependencies"],
})

/**
 * The save-time ownership guard every collector shares: dedupe, skip the query
 * for an empty list, and return the ids the workspace-scoped `find` confirmed.
 * `find` owns the workspace scoping, so the helper cannot be used to widen it.
 */
export const verifyOwnedIds = async (
  ids: readonly string[],
  find: (uniqueIds: string[]) => Promise<readonly { id: string }[]>,
): Promise<string[]> => {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) {
    return []
  }
  const rows = await find(uniqueIds)
  return rows.map((row) => row.id)
}

/**
 * Resolves one reference of a shipped entry through `ctx.idMaps[kind]`. A
 * missing source id is `null` without a warning; an id the maps cannot resolve
 * is `null` WITH a warning (the install degrades to `partial`, never throws).
 * `ignore` lists source ids that mean "no reference" (e.g. the root folder).
 */
export const resolveRef = (
  ctx: TemplateInstallContext,
  input: {
    category: TemplateCategory
    /** The `idMaps` key and the warning's `entityKind`. */
    kind: string
    path: string
    sourceRef: string | null | undefined
    ignore?: readonly string[]
  },
): string | null => {
  const { sourceRef } = input
  if (!sourceRef || input.ignore?.includes(sourceRef)) {
    return null
  }
  const targetId = ctx.idMaps[input.kind]?.get(sourceRef)
  if (!targetId) {
    ctx.warn({
      category: input.category,
      entityKind: input.kind,
      path: input.path,
      value: sourceRef,
    })
    return null
  }
  return targetId
}

/**
 * A backup written by a different format version may not be shaped the way the
 * handler now reads it; refuse it instead of restoring a misread shape.
 */
export const assertBackupFormat = (
  formatVersion: number,
  supported: number,
): void => {
  if (formatVersion !== supported) {
    throw templateBackupNotRestorableException()
  }
}

/** True for a handler that really updates copies (not `updateNotSupported`). */
export const isUpdatable = (handler: ResourceSyncHandler): boolean =>
  handler.updatable !== false

/**
 * The sync handler of a category that cannot be updated in place: it never
 * reads or writes a copy, and `update` raises the `notUpdatable` warning the
 * sync reports (the copies stay exactly as the installer has them).
 */
export const updateNotSupported = (
  category: TemplateCategory,
): ResourceSyncHandler => {
  const notRestorable = templateBackupNotRestorableException
  return {
    updatable: false,
    project: () => Promise.reject(notRestorable()),
    serializeBackup: () => Promise.resolve(null),
    restoreBackup: () => Promise.reject(notRestorable()),
    update: (ctx, pairs) => {
      if (pairs.length > 0) {
        ctx.warn({
          category,
          entityKind: "notUpdatable",
          path: category,
          value: String(pairs.length),
        })
      }
      return Promise.resolve()
    },
  }
}

/** The subset of `ids` that are flows of `workspaceId`; for backups restored after a flow was deleted. */
export const existingFlowIds = async (
  tx: DatabaseClient,
  workspaceId: string,
  ids: readonly (string | null)[],
): Promise<Set<string>> => {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) {
    return new Set()
  }
  const rows = await tx.query.flowModel.findMany({
    where: { workspaceId, id: { in: wanted } },
    columns: { id: true },
  })
  return new Set(rows.map((row) => row.id))
}

/** The map of `kind` in `ctx.idMaps`, created on first use. */
export const idMapOf = (
  ctx: TemplateInstallContext,
  kind: string,
): Map<string, string> => {
  const existing = ctx.idMaps[kind]
  if (existing) {
    return existing
  }
  const created = new Map<string, string>()
  ctx.idMaps[kind] = created
  return created
}

/**
 * Records one installed copy: tracks it under `resourceKind` and, when the kind
 * other categories reference it by is given, maps the source id to the copy.
 */
export const recordCopy = (
  ctx: TemplateInstallContext,
  input: {
    category: TemplateCategory
    resourceKind: TemplateResourceKind
    sourceId: string
    resourceId: string
    /** The `idMaps` key; absent for a category nothing references. */
    idMapKind?: string
    wasExisting?: boolean
  },
): void => {
  if (input.idMapKind) {
    idMapOf(ctx, input.idMapKind).set(input.sourceId, input.resourceId)
  }
  ctx.track({
    category: input.category,
    resourceKind: input.resourceKind,
    resourceId: input.resourceId,
    sourceResourceId: input.sourceId,
    wasExisting: input.wasExisting ?? false,
  })
}

/** Hard dependencies on `ids` of `category`: deduped, nulls dropped. */
export const dependenciesOn = (
  category: TemplateResourceCategory,
  ids: Iterable<string | null | undefined>,
): TemplateHardDependency[] => {
  const unique = new Set<string>()
  for (const id of ids) {
    if (id) {
      unique.add(id)
    }
  }
  return [...unique].map((sourceId) => ({ category, sourceId }))
}

/** `where` fragment narrowing a category's rows to `ids`, or nothing for "all". */
const idFilter = (
  ids: readonly string[] | undefined,
): { id?: { in: string[] } } => (ids ? { id: { in: [...ids] } } : {})

/** What a category's `collectRows` returns; absent lists default to empty. */
export type CollectedRows = {
  entries: readonly TemplateCollectResult["entries"][number][]
  folderIds?: readonly string[]
  productCategoryIds?: readonly string[]
  inboxIds?: readonly string[]
  hardDependencies?: readonly TemplateHardDependency[]
}

/**
 * Builds a category's collector from the two things that differ per category.
 * `findIds` runs the workspace-scoped, soft-delete-aware id query (`ids`
 * narrows it, `limit` bounds it); `collectRows` loads and shapes the rows. The
 * ownership guard and the empty-selection short-circuit are shared.
 */
export const makeCollector = (input: {
  findIds: (query: {
    workspaceId: string
    ids?: readonly string[]
    limit?: number
  }) => Promise<readonly { id: string }[]>
  collectRows: (
    workspaceId: string,
    ids: readonly string[],
  ) => Promise<CollectedRows>
}): ResourceCollector => ({
  resolveIds: async (workspaceId, limit) =>
    (await input.findIds({ workspaceId, limit })).map((row) => row.id),
  verifyOwnership: (workspaceId, ids) =>
    verifyOwnedIds(ids, (uniqueIds) =>
      input.findIds({ workspaceId, ids: uniqueIds }),
    ),
  collect: async (workspaceId, ids) => {
    if (ids.length === 0) {
      return EMPTY_COLLECT_RESULT
    }
    const rows = await input.collectRows(workspaceId, ids)
    return {
      ...rows,
      folderIds: rows.folderIds ?? [],
      productCategoryIds: rows.productCategoryIds ?? [],
      hardDependencies: rows.hardDependencies ?? [],
    }
  },
})

/** `where` for `findIds`: the workspace, an optional id list and extra filters. */
export const scopedWhere = <Extra extends object>(
  query: { workspaceId: string; ids?: readonly string[] },
  extra?: Extra,
) => ({ workspaceId: query.workspaceId, ...idFilter(query.ids), ...extra })

/**
 * The unresolved references not already reported at `reported` (the paths
 * warned as `referenceRemoved`, an element dropped included), so a removed
 * reference is reported once instead of also under its own kind.
 */
export const notYetReported = (
  unresolved: readonly UnresolvedReference[],
  reported: readonly string[],
): UnresolvedReference[] =>
  unresolved.filter(
    (ref) =>
      !reported.some(
        (path) =>
          ref.path === path ||
          ref.path.startsWith(`${path}.`) ||
          ref.path.startsWith(`${path}[`),
      ),
  )

/**
 * Resolves the folder an entry sits in; a missing folder reference is `null`
 * without a warning. `pathPrefix` replaces the category in the warning path;
 * `ignore` lists source ids that mean "no folder".
 */
export const resolveFolderRef = (
  ctx: TemplateInstallContext,
  category: TemplateCategory,
  entry: { sourceId: string; folderId?: string | null },
  options: { pathPrefix?: string; ignore?: readonly string[] } = {},
): string | null =>
  resolveRef(ctx, {
    category,
    kind: "folder",
    path: `${options.pathPrefix ?? category}.${entry.sourceId}.folderId`,
    sourceRef: entry.folderId,
    ignore: options.ignore,
  })

/**
 * Defers writing a flow reference until every flow of the install exists
 * (Phase 2). Warnings are keyed by the SOURCE entry id, like every other
 * warning of the category: `<category>.<sourceEntryId>.<field>`.
 */
export const createFlowRefPatcher = (category: TemplateCategory) => {
  const steps: Array<(ctx: TemplateInstallContext) => Promise<void>> = []
  return {
    /** Writes the copy of `sourceFlowId` through `write`; an unknown flow warns and writes nothing. */
    defer(input: {
      sourceEntryId: string
      field: string
      sourceFlowId: string | null | undefined
      write: (
        tx: DatabaseClient,
        targetFlowId: string,
        ctx: TemplateInstallContext,
      ) => Promise<void> | void
    }): void {
      if (!input.sourceFlowId) {
        return
      }
      const sourceRef = input.sourceFlowId
      steps.push(async (ctx) => {
        const targetFlowId = resolveRef(ctx, {
          category,
          kind: "flow",
          path: `${category}.${input.sourceEntryId}.${input.field}`,
          sourceRef,
        })
        if (targetFlowId) {
          await input.write(ctx.tx, targetFlowId, ctx)
        }
      })
    },
    /** Runs after the writes deferred before it (e.g. to flush what they gathered). */
    afterWrites(run: (ctx: TemplateInstallContext) => Promise<void>): void {
      steps.push(run)
    },
    /** The Phase-2 task, or none when nothing was deferred. */
    tasks(): PatchTask[] {
      if (steps.length === 0) {
        return []
      }
      return [
        {
          category,
          apply: async (ctx) => {
            for (const step of steps) {
              await step(ctx)
            }
          },
        },
      ]
    },
  }
}

/**
 * Warns that a staged storage object could not be used. The reason the
 * staging recorded (`staged.skipped`) is the warning's `entityKind`; an
 * object that was never staged falls back to `fallbackKind`.
 */
export const warnStagedSkip = (
  ctx: TemplateInstallContext,
  input: {
    category: TemplateCategory
    staged: StagedObject | undefined
    fallbackKind: string
    path: string
    value: string
  },
): void => {
  ctx.warn({
    category: input.category,
    entityKind:
      input.staged && "skipped" in input.staged
        ? input.staged.skipped
        : input.fallbackKind,
    path: input.path,
    value: input.value,
  })
}

/** Rows of the workspace that already carry `name` (names are unique per workspace). */
export type FindByName = (name: string) => Promise<readonly { id: string }[]>

/** True when a row other than `resourceId` already has `name`. */
export const nameTakenByOther = async (
  findByName: FindByName,
  name: string,
  resourceId: string,
): Promise<boolean> =>
  (await findByName(name)).some((row) => row.id !== resourceId)

/**
 * The name a sync writes onto an installed copy: the template's name, or the
 * current one (with a `name` warning) when another row took the new name.
 */
export const resolveSyncedName = async (
  ctx: TemplateInstallContext,
  input: {
    category: TemplateCategory
    sourceId: string
    resourceId: string
    currentName: string
    wantedName: string
    findByName: FindByName
  },
): Promise<string> => {
  if (
    input.wantedName === input.currentName ||
    !(await nameTakenByOther(
      input.findByName,
      input.wantedName,
      input.resourceId,
    ))
  ) {
    return input.wantedName
  }
  ctx.warn({
    category: input.category,
    entityKind: "name",
    path: `${input.category}.${input.sourceId}.name`,
    value: input.wantedName,
  })
  return input.currentName
}
