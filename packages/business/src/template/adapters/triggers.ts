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
import { templateBackupNotRestorableException } from "../template-errors"
import {
  canonicalConditionRows,
  collectTriggerConditionReferences,
  remapTriggerConditions,
  type TriggerConditionRow,
} from "../trigger-conditions"
import { withTriggerFieldKeysAsIds } from "../trigger-field-keys"
import { insertCopyNamed } from "./naming"
import {
  assertBackupFormat,
  dependenciesOn,
  type FindByName,
  makeCollector,
  nameTakenByOther,
  notYetReported,
  recordCopy,
  resolveFolderRef,
  resolveSyncedName,
  scopedWhere,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
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

/** The trigger row, locked for the rest of the transaction (see the keywords adapter). */
const readRow = async (tx: DatabaseClient, resourceId: string) => {
  const [row] = await tx
    .select()
    .from(triggerModel)
    .where(eq(triggerModel.id, resourceId))
    .for("update")
    .limit(1)
  return row
}

const contentOf = (row: {
  name: string
  actions: unknown
}): TriggerContent => ({
  name: row.name,
  actions: row.actions as TriggerContent["actions"],
})

const readContent = async (
  tx: DatabaseClient,
  resourceId: string,
): Promise<TriggerContent | null> => {
  const row = await readRow(tx, resourceId)
  return row ? contentOf(row) : null
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

/** Replaces a trigger's condition rows with `rows` exactly as given. */
const insertConditionRows = async (
  tx: DatabaseClient,
  triggerId: string,
  rows: readonly TriggerConditionRow[],
): Promise<void> => {
  await tx.delete(conditionModel).where(eq(conditionModel.triggerId, triggerId))
  if (rows.length > 0) {
    await tx.insert(conditionModel).values(
      rows.map((condition) => ({
        id: createId(),
        triggerId,
        type: condition.type,
        sourceId: condition.sourceId,
        operator: condition.operator,
        value: condition.value ?? null,
      })),
    )
  }
}

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
  await insertConditionRows(ctx.tx, input.triggerId, conditions)
  return { lostRows: dropped.length > 0 }
}

/** The workspace's triggers named `name` (the name is unique per workspace). */
const findTriggersByName =
  (tx: DatabaseClient, workspaceId: string): FindByName =>
  (name) =>
    tx.query.triggerModel.findMany({
      where: { workspaceId, name },
      columns: { id: true },
    })

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
    onUnresolved: (ref) => unresolved.push(ref),
  })
  const sanitized = await sanitizeEntryReferences({
    workspaceId: ctx.workspaceId,
    tx: ctx.tx,
    value: remapped,
    unresolved,
    keepKinds: TRIGGER_OWN_KINDS,
  })
  // A removed reference is reported once, as removed; the rest under their kind.
  for (const ref of notYetReported(unresolved, sanitized.removed)) {
    ctx.warn({
      category: "triggers",
      entityKind: ref.entityKind,
      path: `triggers.${entry.sourceId}.actions.${ref.path}`,
      value: ref.value,
    })
  }
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
 * collision is handled via the shared copy-name scheme (`<name> - Copy`), same
 * as the other named categories. `actions` are remapped through the generic engine
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
    for (const entry of entries) {
      const remappedActions = await remapActions(ctx, entry)
      const folderId = resolveFolderRef(ctx, "triggers", entry)

      const created = await insertCopyNamed(ctx, {
        category: "triggers",
        constraint: "Trigger_workspaceId_name_key",
        entry,
        findTaken: (tx, name) =>
          tx.query.triggerModel.findMany({
            where: { workspaceId: ctx.workspaceId, name },
            columns: { name: true },
          }),
        insert: (tx, name) =>
          tx
            .insert(triggerModel)
            .values({
              id: createId(),
              workspaceId: ctx.workspaceId,
              name,
              active: entry.active,
              actions: remappedActions,
              folderId,
            })
            .returning()
            .then(([row]) => row),
      })
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

      recordCopy(ctx, {
        category: "triggers",
        resourceKind: "trigger",
        idMapKind: "trigger",
        sourceId: entry.sourceId,
        resourceId: created.id,
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
      const row = await readRow(tx, resourceId)
      if (!row) {
        return null
      }
      return {
        formatVersion: BACKUP_FORMAT_VERSION,
        content: {
          ...contentOf(row),
          active: row.active,
          conditions: await readConditions(tx, resourceId),
        },
      }
    },

    async restoreBackup(tx, resourceId, content, formatVersion) {
      assertBackupFormat(formatVersion, BACKUP_FORMAT_VERSION)
      const parsed = triggerBackupSchema.safeParse(content)
      if (!parsed.success) {
        throw templateBackupNotRestorableException()
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
      const name = (await nameTakenByOther(
        findTriggersByName(tx, row.workspaceId),
        backup.name,
        resourceId,
      ))
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
      await insertConditionRows(tx, resourceId, backup.conditions)
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
        const name = await resolveSyncedName(ctx, {
          category: "triggers",
          sourceId: entry.sourceId,
          resourceId,
          currentName: current.name,
          wantedName: entry.name,
          findByName: findTriggersByName(ctx.tx, ctx.workspaceId),
        })
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
            name,
            actions,
            // `active` is the installer's, but a trigger that lost a
            // condition row would fire more broadly than intended.
            ...(lostRows ? { active: false } : {}),
          })
          .where(eq(triggerModel.id, resourceId))
      }
    },
  } satisfies ResourceSyncHandler<TemplateTriggerEntry>,

  collector: makeCollector({
    findIds: (query) =>
      db.query.triggerModel.findMany({
        where: scopedWhere(query),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.triggerModel.findMany({
        where: scopedWhere({ workspaceId, ids }),
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
      // Fields named by name ship as ids, like every other reference.
      const actionsById = await withTriggerFieldKeysAsIds(
        workspaceId,
        rows.map((row) => row.actions),
      )
      const entries = rows.map((row, index) => ({
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
        actions: actionsById[index] as TriggerActions,
        folderId: row.folderId,
      }))

      // A trigger action that starts a sequence or a questionnaire, or issues
      // a coupon, needs it in the template.
      const conditionReferences = collectTriggerConditionReferences(
        entries.flatMap((entry) => entry.conditions),
      )
      return {
        entries,
        folderIds: rows.flatMap((row) => (row.folderId ? [row.folderId] : [])),
        productCategoryIds: [
          ...(conditionReferences.get("productCategory") ?? []),
        ],
        hardDependencies: [
          ...entries.flatMap((entry) =>
            collectResourceDependencies(entry.actions),
          ),
          ...dependenciesOn(
            "sequences",
            conditionReferences.get("sequence") ?? [],
          ),
        ],
      }
    },
  }),
}
