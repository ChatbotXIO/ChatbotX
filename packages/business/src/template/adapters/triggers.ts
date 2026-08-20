import { db } from "@chatbotx.io/database/client"
import { triggerModel } from "@chatbotx.io/database/schema"
import { remapReferences } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { insertWithNameRetry } from "./naming"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateInstallContext,
} from "./types"

type TemplateTriggerEntry = {
  sourceId: string
  name: string
  active: boolean
  // Arbitrary jsonb action-step configs — the same reference-remapping
  // surface as flow steps. `Condition.sourceId` (discriminated by a sibling
  // `sourceType` of `trigger`/`webhook`) lives inside these, handled by the
  // generic remapper's `DISCRIMINATED_REFERENCE_FIELDS` rule.
  actions: unknown[]
  folderId: string | null
}

const TRIGGER_REMAP_KINDS = [
  "customField",
  "sequence",
  "aiAgent",
  "integration",
  "calendar",
  "questionnaire",
  "couponTopic",
  "inbox",
  "messengerPersona",
  "spreadsheet",
  "tag",
  "flow",
  "webhook",
  "trigger",
]

/**
 * `Trigger(workspaceId, name)` has a real unique constraint, so a name
 * collision is handled via the shared retry-on-conflict suffixer, same as
 * entry-point links. `actions` are remapped through the generic engine
 * (every kind currently resolvable by the time triggers insert, since
 * triggers are the last Phase-1 category before fbCommentAutomations).
 */
export const triggersAdapter: ResourceAdapter = {
  category: "triggers",
  providesKinds: ["trigger"],
  consumesKinds: [...TRIGGER_REMAP_KINDS, "folder"],
  deferredKinds: [],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.trigger) {
      ctx.idMaps.trigger = new Map()
    }
    const idMap = ctx.idMaps.trigger

    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateTriggerEntry
      const remappedActions = remapReferences(entry.actions, ctx.idMaps, {
        kinds: TRIGGER_REMAP_KINDS,
        onUnresolved: (ref) =>
          ctx.warn({
            category: "triggers",
            entityKind: ref.entityKind,
            path: `triggers.${entry.sourceId}.actions.${ref.path}`,
            value: ref.value,
          }),
      })
      const folderId = resolveFolderRef(ctx, entry)

      const created = await insertWithNameRetry(
        ctx.tx,
        "Trigger_workspaceId_name_key",
        entry.name,
        (tx, candidateName) =>
          tx
            .insert(triggerModel)
            .values({
              id: createId(),
              workspaceId: ctx.workspaceId,
              name: candidateName,
              active: entry.active,
              actions: remappedActions,
              folderId,
            })
            .returning()
            .then(([row]) => row),
        (lastAttemptedName) =>
          ctx.warn({
            category: "triggers",
            entityKind: "name",
            path: `triggers.${entry.sourceId}.name`,
            value: lastAttemptedName,
          }),
      )
      if (!created) {
        continue
      }

      idMap.set(entry.sourceId, created.id)
      ctx.track({
        category: "triggers",
        resourceKind: "trigger",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [] satisfies PatchTask[]
  },

  collector: {
    async resolveIds(workspaceId) {
      const rows = await db.query.triggerModel.findMany({
        where: { workspaceId },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) {
        return []
      }
      const rows = await db.query.triggerModel.findMany({
        where: { workspaceId, id: { in: uniqueIds } },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return {
          entries: [],
          folderIds: [],
          productCategoryIds: [],
          hardDependencies: [],
        }
      }
      const rows = await db.query.triggerModel.findMany({
        where: { workspaceId, id: { in: [...ids] } },
      })
      const entries = rows.map((row) => ({
        sourceId: row.id,
        name: row.name,
        active: row.active,
        // Every reference inside `actions` is still the real source-workspace
        // id at collect time — no remapping happens until install, where
        // `remapReferences` translates them via `idMaps`.
        actions: row.actions,
        folderId: row.folderId,
      }))
      const folderIds = rows.flatMap((row) =>
        row.folderId ? [row.folderId] : [],
      )

      return {
        entries,
        folderIds,
        productCategoryIds: [],
        hardDependencies: [],
      }
    },
  } satisfies ResourceCollector,
}

const resolveFolderRef = (
  ctx: TemplateInstallContext,
  entry: TemplateTriggerEntry,
): string | null => {
  if (!entry.folderId) {
    return null
  }
  const targetId = ctx.idMaps.folder?.get(entry.folderId)
  if (!targetId) {
    ctx.warn({
      category: "triggers",
      entityKind: "folder",
      path: `triggers.${entry.sourceId}.folderId`,
      value: entry.folderId,
    })
    return null
  }
  return targetId
}
