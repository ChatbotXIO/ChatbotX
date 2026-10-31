import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { templateBackupNotRestorableException } from "../template-errors"
import type {
  ResourceSyncHandler,
  TemplateCollectResult,
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
