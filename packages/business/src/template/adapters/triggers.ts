import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { conditionModel, triggerModel } from "@chatbotx.io/database/schema"
import {
  remapReferences,
  type UnresolvedReference,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { omitKeys } from "../fingerprint"
import { collectResourceDependencies } from "../manifest-references"
import { sanitizeEntryReferences } from "../reference-sanitizer"
import {
  canonicalConditionRows,
  collectTriggerConditionReferences,
  remapTriggerConditions,
  type TriggerConditionRow,
} from "../trigger-conditions"
import { insertWithNameRetry } from "./naming"
import {
  assertBackupFormat,
  EMPTY_COLLECT_RESULT,
  resolveRef,
  verifyOwnedIds,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  ResourceSyncHandler,
  TemplateInstallContext,
} from "./types"

/** The shape `serializeBackup` writes and `restoreBackup` reads. */
const BACKUP_FORMAT_VERSION = 1

/** Fields the installer owns: a sync never writes them, and they never enter the fingerprint. */
const TRIGGER_INSTALLER_OWNED_FIELDS = ["active", "folderId"] as const

/** What a template update overwrites on an installed trigger: its name and actions. */
const triggerContentSchema = z.object({
  name: z.string(),
  actions: z.array(z.unknown()),
})
type TriggerContent = z.infer<typeof triggerContentSchema>

/**
 * What a backup keeps: the overwritten content, the trigger's condition rows
 * and its `active` flag, so a restore returns the trigger exactly as it was
 * (a sync that drops a condition row also switches the trigger off, and that
 * has to be undone with the rows). `active` is absent from older backups,
 * whose restore leaves the flag alone.
 */
const triggerBackupSchema = triggerContentSchema.extend({
  active: z.boolean().optional(),
  conditions: z
    .array(
      z.object({
        type: z.string(),
        sourceId: z.string().nullable(),
        operator: z.string().nullable(),
        value: z.unknown(),
      }),
    )
    .default([]),
})
type TriggerActions = (typeof triggerModel.$inferInsert)["actions"]

const readContent = async (
  tx: DatabaseClient,
  resourceId: string,
): Promise<TriggerContent | null> => {
  // Locked for the rest of the transaction (see the keywords adapter).
  const [row] = await tx
    .select()
    .from(triggerModel)
    .where(eq(triggerModel.id, resourceId))
    .for("update")
    .limit(1)
  return row ? { name: row.name, actions: row.actions } : null
}

const readConditions = async (
  tx: DatabaseClient,
  resourceId: string,
): Promise<TriggerConditionRow[]> =>
  await tx.query.conditionModel.findMany({
    where: { triggerId: resourceId },
    orderBy: { id: "asc" },
    columns: { type: true, sourceId: true, operator: true, value: true },
  })

/**
 * Replaces a trigger's condition rows with `rows`. The rows are remapped to
 * this workspace first; one that names something that did not make it across
 * is dropped, and a trigger that lost a row is switched off (warned about)
 * rather than left firing more broadly than the publisher intended.
 * Returns whether the trigger must stay inactive.
 */
const writeConditions = async (
  ctx: TemplateInstallContext,
  input: { triggerId: string; sourceId: string; rows: TriggerConditionRow[] },
): Promise<{ lostRows: boolean }> => {
  const { conditions, dropped } = remapTriggerConditions(input.rows, ctx.idMaps)
  for (const drop of dropped) {
    ctx.warn({
      category: "triggers",
      entityKind: "referenceRemoved",
      path: `triggers.${input.sourceId}.conditions.${drop.index}`,
      value: `${drop.kind}:${drop.id}`,
    })
  }
  await ctx.tx
    .delete(conditionModel)
    .where(eq(conditionModel.triggerId, input.triggerId))
  if (conditions.length > 0) {
    await ctx.tx.insert(conditionModel).values(
      conditions.map((condition) => ({
        id: createId(),
        triggerId: input.triggerId,
        type: condition.type,
        sourceId: condition.sourceId,
        operator: condition.operator,
        value: condition.value ?? null,
      })),
    )
  }
  return { lostRows: dropped.length > 0 }
}

/** True when another trigger of the workspace already has `name` (the name is unique per workspace). */
const nameTakenByOther = async (
  tx: DatabaseClient,
  input: { workspaceId: string; name: string; resourceId: string },
): Promise<boolean> => {
  const rows = await tx.query.triggerModel.findMany({
    where: { workspaceId: input.workspaceId, name: input.name },
    columns: { id: true },
  })
  return rows.some((row) => row.id !== input.resourceId)
}

type TemplateTriggerEntry = {
  sourceId: string
  name: string
  active: boolean
  // Arbitrary jsonb action-step configs — the same reference-remapping
  // surface as flow steps. `Condition.sourceId` (discriminated by a sibling
  // `sourceType` of `trigger`/`webhook`) lives inside these, handled by the
  // generic remapper's `DISCRIMINATED_REFERENCE_FIELDS` rule.
  actions: unknown[]
  /** Absent in a template saved before conditions were shipped: such a trigger's rows are left alone. */
  conditions?: TriggerConditionRow[]
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

/** The kinds the condition rows can name, on top of what the actions name. */
const TRIGGER_CONDITION_KINDS = [
  "product",
  "productCategory",
  "pipeline",
  "pipelineStage",
]

/** Another trigger of the same template resolves later, so it is not judged here. */
const TRIGGER_OWN_KINDS: ReadonlySet<string> = new Set(["trigger"])

/**
 * The entry's actions with every reference remapped to this workspace. One no
 * map resolved is warned about and then removed (the action that needs it is
 * dropped), so a copy never keeps the source workspace's id.
 */
const remapActions = async (
  ctx: TemplateInstallContext,
  entry: TemplateTriggerEntry,
): Promise<unknown[]> => {
  const unresolved: UnresolvedReference[] = []
  const remapped = remapReferences(entry.actions, ctx.idMaps, {
    kinds: TRIGGER_REMAP_KINDS,
    onUnresolved: (ref) => {
      unresolved.push(ref)
      ctx.warn({
        category: "triggers",
        entityKind: ref.entityKind,
        path: `triggers.${entry.sourceId}.actions.${ref.path}`,
        value: ref.value,
      })
    },
  })
  const sanitized = await sanitizeEntryReferences({
    workspaceId: ctx.workspaceId,
    tx: ctx.tx,
    value: remapped,
    unresolved,
    keepKinds: TRIGGER_OWN_KINDS,
  })
  for (const path of sanitized.removed) {
    ctx.warn({
      category: "triggers",
      entityKind: "referenceRemoved",
      path: `triggers.${entry.sourceId}.actions.${path}`,
      value: entry.sourceId,
    })
  }
  return sanitized.value
}

/**
 * `Trigger(workspaceId, name)` has a real unique constraint, so a name
 * collision is handled via the shared retry-on-conflict suffixer, same as
 * entry-point links. `actions` are remapped through the generic engine
 * (every kind currently resolvable by the time triggers insert, since
 * triggers are the last Phase-1 category before fbCommentAutomations).
 */
export const triggersAdapter: ResourceAdapter<TemplateTriggerEntry> = {
  category: "triggers",
  providesKinds: ["trigger"],
  consumesKinds: [...TRIGGER_REMAP_KINDS, ...TRIGGER_CONDITION_KINDS, "folder"],
  deferredKinds: [],
  trackedKind: "trigger",
  folderTypes: ["trigger"],
  minFormatVersion: 1,
  fingerprint: {
    project: (entry) => omitKeys(entry, TRIGGER_INSTALLER_OWNED_FIELDS),
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateTriggerEntry[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.trigger) {
      ctx.idMaps.trigger = new Map()
    }
    const idMap = ctx.idMaps.trigger

    for (const entry of entries) {
      const remappedActions = await remapActions(ctx, entry)
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

      if (entry.conditions) {
        const { lostRows } = await writeConditions(ctx, {
          triggerId: created.id,
          sourceId: entry.sourceId,
          rows: entry.conditions,
        })
        if (lostRows && created.active) {
          await ctx.tx
            .update(triggerModel)
            .set({ active: false })
            .where(eq(triggerModel.id, created.id))
        }
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

  sync: {
    async project(tx, resourceId) {
      const content = await readContent(tx, resourceId)
      return content
        ? {
            ...content,
            conditions: canonicalConditionRows(
              await readConditions(tx, resourceId),
            ),
          }
        : null
    },

    async serializeBackup(tx, resourceId) {
      const content = await readContent(tx, resourceId)
      if (!content) {
        return null
      }
      const [row] = await tx
        .select({ active: triggerModel.active })
        .from(triggerModel)
        .where(eq(triggerModel.id, resourceId))
        .limit(1)
      return {
        formatVersion: BACKUP_FORMAT_VERSION,
        content: {
          ...content,
          active: row?.active,
          conditions: await readConditions(tx, resourceId),
        },
      }
    },

    async restoreBackup(tx, resourceId, content, formatVersion) {
      assertBackupFormat(formatVersion, BACKUP_FORMAT_VERSION)
      const parsed = triggerBackupSchema.safeParse(content)
      if (!parsed.success) {
        throw new Error("The trigger backup is not in a restorable shape")
      }
      const backup = parsed.data
      const [row] = await tx
        .select({
          workspaceId: triggerModel.workspaceId,
          name: triggerModel.name,
        })
        .from(triggerModel)
        .where(eq(triggerModel.id, resourceId))
        .limit(1)
      if (!row) {
        return
      }
      // The old name may have been taken since; keep the current one then.
      const name = (await nameTakenByOther(tx, {
        workspaceId: row.workspaceId,
        name: backup.name,
        resourceId,
      }))
        ? row.name
        : backup.name
      await tx
        .update(triggerModel)
        .set({
          name,
          actions: backup.actions as TriggerActions,
          ...(backup.active === undefined ? {} : { active: backup.active }),
        })
        .where(eq(triggerModel.id, resourceId))
      await tx
        .delete(conditionModel)
        .where(eq(conditionModel.triggerId, resourceId))
      if (backup.conditions.length > 0) {
        await tx.insert(conditionModel).values(
          backup.conditions.map((condition) => ({
            id: createId(),
            triggerId: resourceId,
            type: condition.type,
            sourceId: condition.sourceId,
            operator: condition.operator,
            value: condition.value ?? null,
          })),
        )
      }
    },

    // `active` and the folder are the installer's. A name another trigger took
    // is kept as it is (and warned about), never a unique violation.
    async update(ctx, pairs) {
      for (const { entry, resourceId } of pairs) {
        const current = await readContent(ctx.tx, resourceId)
        if (!current) {
          continue
        }
        const actions = await remapActions(ctx, entry)
        const nameTaken =
          entry.name !== current.name &&
          (await nameTakenByOther(ctx.tx, {
            workspaceId: ctx.workspaceId,
            name: entry.name,
            resourceId,
          }))
        if (nameTaken) {
          ctx.warn({
            category: "triggers",
            entityKind: "name",
            path: `triggers.${entry.sourceId}.name`,
            value: entry.name,
          })
        }
        const lostRows = entry.conditions
          ? (
              await writeConditions(ctx, {
                triggerId: resourceId,
                sourceId: entry.sourceId,
                rows: entry.conditions,
              })
            ).lostRows
          : false
        await ctx.tx
          .update(triggerModel)
          .set({
            name: nameTaken ? current.name : entry.name,
            actions,
            // `active` is the installer's, but a trigger that lost a
            // condition row would fire more broadly than intended.
            ...(lostRows ? { active: false } : {}),
          })
          .where(eq(triggerModel.id, resourceId))
      }
    },
  } satisfies ResourceSyncHandler<TemplateTriggerEntry>,

  collector: {
    async resolveIds(workspaceId, limit) {
      const rows = await db.query.triggerModel.findMany({
        where: { workspaceId },
        columns: { id: true },
        limit,
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      return await verifyOwnedIds(ids, (uniqueIds) =>
        db.query.triggerModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
          columns: { id: true },
        }),
      )
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return EMPTY_COLLECT_RESULT
      }
      const rows = await db.query.triggerModel.findMany({
        where: { workspaceId, id: { in: [...ids] } },
      })
      // One query for every trigger's rows (no per-trigger lookups).
      const conditionRows = await db.query.conditionModel.findMany({
        where: { triggerId: { in: rows.map((row) => row.id) } },
        orderBy: { id: "asc" },
        columns: {
          triggerId: true,
          type: true,
          sourceId: true,
          operator: true,
          value: true,
        },
      })
      const conditionsByTrigger = Map.groupBy(
        conditionRows,
        (condition) => condition.triggerId,
      )
      const entries = rows.map((row) => ({
        sourceId: row.id,
        name: row.name,
        active: row.active,
        conditions: (conditionsByTrigger.get(row.id) ?? []).map(
          ({ type, sourceId, operator, value }) => ({
            type,
            sourceId,
            operator,
            value,
          }),
        ),
        // Every reference inside `actions` is still the real source-workspace
        // id at collect time — no remapping happens until install, where
        // `remapReferences` translates them via `idMaps`.
        actions: row.actions,
        folderId: row.folderId,
      }))
      const folderIds = rows.flatMap((row) =>
        row.folderId ? [row.folderId] : [],
      )

      // A trigger action that starts a sequence or a questionnaire, or issues
      // a coupon, needs it in the template.
      const conditionReferences = collectTriggerConditionReferences(
        entries.flatMap((entry) => entry.conditions),
      )
      const dependencies = [
        ...entries.flatMap((entry) =>
          collectResourceDependencies(entry.actions),
        ),
        ...[...(conditionReferences.get("sequence") ?? [])].map((sourceId) => ({
          category: "sequences" as const,
          sourceId,
        })),
      ]

      return {
        entries,
        folderIds,
        productCategoryIds: [
          ...(conditionReferences.get("productCategory") ?? []),
        ],
        hardDependencies: dependencies,
      }
    },
  } satisfies ResourceCollector,
}

const resolveFolderRef = (
  ctx: TemplateInstallContext,
  entry: TemplateTriggerEntry,
): string | null =>
  resolveRef(ctx, {
    category: "triggers",
    kind: "folder",
    path: `triggers.${entry.sourceId}.folderId`,
    sourceRef: entry.folderId,
  })
