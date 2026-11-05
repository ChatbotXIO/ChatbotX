import {
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { sequenceModel, sequenceStepModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { omitKeys } from "../fingerprint"
import { templateBackupNotRestorableException } from "../template-errors"
import { insertCopyNamed } from "./naming"
import {
  assertBackupFormat,
  createFlowRefPatcher,
  dependenciesOn,
  existingFlowIds,
  type FindByName,
  makeCollector,
  nameTakenByOther,
  recordCopy,
  resolveFolderRef,
  resolveRef,
  resolveSyncedName,
  scopedWhere,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceSyncHandler,
  TemplateInstallContext,
} from "./types"

/** The shape `serializeBackup` and `restoreBackup` agree on. */
const BACKUP_FORMAT_VERSION = 1

/**
 * Fields the installer owns or the system derives: a sync never overwrites
 * them (running subscribers, the counters and the on/off switch survive), and
 * they never enter the fingerprint.
 */
const SEQUENCE_INSTALLER_OWNED_FIELDS = [
  "active",
  "folderId",
  "subscribers",
  "messages",
] as const

const stepContentSchema = z.object({
  order: z.number().int(),
  delayDays: z.number().int(),
  delayMinutes: z.number().int(),
  delayUnit: z.string().nullable(),
  specificDateTime: z.string().nullable(),
  isActive: z.boolean(),
  anytime: z.boolean(),
  sendTimeStart: z.string().nullable(),
  sendTimeEnd: z.string().nullable(),
  sendDays: z.string().nullable(),
  /** A flow of the installed copy's own workspace. */
  flowId: z.string().nullable(),
})
type StepContent = z.infer<typeof stepContentSchema>

/** What a template update overwrites on an installed sequence: its name and its steps, in order. */
const sequenceContentSchema = z.object({
  name: z.string(),
  steps: z.array(stepContentSchema),
})
type SequenceContent = z.infer<typeof sequenceContentSchema>

/** A step row in the shape the template ships and a sync compares. */
const stepEntryOf = (
  step: typeof sequenceStepModel.$inferSelect,
): StepContent => ({
  order: step.order,
  delayDays: step.delayDays,
  delayMinutes: step.delayMinutes,
  delayUnit: step.delayUnit,
  specificDateTime: step.specificDateTime?.toISOString() ?? null,
  isActive: step.isActive,
  anytime: step.anytime,
  sendTimeStart: step.sendTimeStart,
  sendTimeEnd: step.sendTimeEnd,
  sendDays: step.sendDays,
  flowId: step.flowId,
})

const readContent = async (
  tx: DatabaseClient,
  resourceId: string,
): Promise<SequenceContent | null> => {
  // Locked for the rest of the transaction (see the keywords adapter).
  const [row] = await tx
    .select()
    .from(sequenceModel)
    .where(eq(sequenceModel.id, resourceId))
    .for("update")
    .limit(1)
  if (!row) {
    return null
  }
  const steps = await tx.query.sequenceStepModel.findMany({
    where: { sequenceId: resourceId },
    orderBy: { order: "asc", id: "asc" },
  })
  return { name: row.name, steps: steps.filter(isContentStep).map(stepEntryOf) }
}

/** Off and sending nothing: a step a sync switched off. It is not the sequence's content. */
const isContentStep = (step: {
  isActive: boolean
  flowId: string | null
}): boolean => step.isActive || step.flowId !== null

const stepColumns = (step: StepContent) => ({
  order: step.order,
  delayDays: step.delayDays,
  delayMinutes: step.delayMinutes,
  delayUnit: step.delayUnit,
  specificDateTime: step.specificDateTime
    ? new Date(step.specificDateTime)
    : null,
  isActive: step.isActive,
  anytime: step.anytime,
  sendTimeStart: step.sendTimeStart,
  sendTimeEnd: step.sendTimeEnd,
  sendDays: step.sendDays,
  flowId: step.flowId,
})

/**
 * Writes `steps` onto the sequence in place: the n-th existing step takes the
 * n-th new step's content and KEEPS ITS ID, so contacts mid-sequence
 * (`lastStepId`/`nextStepId`) and their dispatch history stay attached. Extra
 * new steps are inserted and the step counter follows the step count.
 *
 * Steps beyond the new count are switched off, never deleted: a delete cascades
 * over their dispatches, which can be millions, inside this transaction. A
 * contact reaching one moves on as at any inactive step, and the installer can
 * remove it in the editor.
 */
const writeSteps = async (
  tx: DatabaseClient,
  sequenceId: string,
  steps: readonly StepContent[],
): Promise<void> => {
  const rows = await tx.query.sequenceStepModel.findMany({
    where: { sequenceId },
    orderBy: { order: "asc", id: "asc" },
    columns: { id: true, isActive: true, flowId: true },
  })
  // Content rows first: a contact waiting on one keeps it, and a switched-off
  // row is only taken back when the new version needs more steps.
  const existing = [
    ...rows.filter(isContentStep),
    ...rows.filter((row) => !isContentStep(row)),
  ]
  for (const [index, step] of steps.entries()) {
    const current = existing[index]
    if (current) {
      await tx
        .update(sequenceStepModel)
        .set(stepColumns(step))
        .where(eq(sequenceStepModel.id, current.id))
    } else {
      await tx
        .insert(sequenceStepModel)
        .values({ id: createId(), sequenceId, ...stepColumns(step) })
    }
  }
  const surplus = existing.slice(steps.length).map((step) => step.id)
  if (surplus.length > 0) {
    await tx
      .update(sequenceStepModel)
      .set({ isActive: false, flowId: null })
      .where(inArray(sequenceStepModel.id, surplus))
  }
  await tx
    .update(sequenceModel)
    .set({ messages: steps.length })
    .where(eq(sequenceModel.id, sequenceId))
}

/** The workspace's sequences named `name` (unique per workspace). */
const findSequencesByName =
  (tx: DatabaseClient, workspaceId: string): FindByName =>
  (name) =>
    tx.query.sequenceModel.findMany({
      where: { workspaceId, name },
      columns: { id: true },
    })

type TemplateSequenceStepEntry = {
  order: number
  delayDays: number
  delayMinutes: number
  delayUnit: string | null
  specificDateTime: string | null
  isActive: boolean
  anytime: boolean
  sendTimeStart: string | null
  sendTimeEnd: string | null
  sendDays: string | null
  // A `resources.flows` sourceId. Sequences install before flows (a flow can
  // subscribe to a sequence), so the step's flow is always patched afterwards.
  flowId: string | null
}

type TemplateSequenceEntry = {
  sourceId: string
  name: string
  active: boolean
  folderId: string | null
  steps: TemplateSequenceStepEntry[]
}

/**
 * A sequence is copied with its steps and nothing that happened to the
 * source: no subscribers, no dispatch history, and the `subscribers` /
 * `messages` counters start from what was actually inserted. Names are unique
 * per workspace, so a collision gets the shared copy name.
 * Each step's flow is patched once flows exist.
 */
export const sequencesAdapter: ResourceAdapter<TemplateSequenceEntry> = {
  category: "sequences",
  providesKinds: ["sequence"],
  consumesKinds: ["flow", "folder"],
  deferredKinds: ["flow"],
  trackedKind: "sequence",
  folderTypes: ["sequence"],
  minFormatVersion: 2,
  fingerprint: {
    project: (entry) => omitKeys(entry, SEQUENCE_INSTALLER_OWNED_FIELDS),
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateSequenceEntry[],
  ): Promise<PatchTask[]> {
    const flowRefs = createFlowRefPatcher("sequences")

    for (const entry of entries) {
      const folderId = resolveFolderRef(ctx, "sequences", entry)

      const created = await insertCopyNamed(ctx, {
        category: "sequences",
        constraint: "Sequence_workspaceId_name_key",
        entry,
        findTaken: (tx, name) =>
          tx.query.sequenceModel.findMany({
            where: { workspaceId: ctx.workspaceId, name },
            columns: { name: true },
          }),
        insert: (tx, name) =>
          tx
            .insert(sequenceModel)
            .values({
              id: createId(),
              workspaceId: ctx.workspaceId,
              name,
              active: entry.active,
              folderId,
              subscribers: 0,
              messages: entry.steps.length,
            })
            .returning()
            .then(([row]) => row),
      })
      if (!created) {
        continue
      }

      recordCopy(ctx, {
        category: "sequences",
        resourceKind: "sequence",
        idMapKind: "sequence",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })

      if (entry.steps.length === 0) {
        continue
      }
      // The step's flow is patched once flows exist.
      const stepRows = entry.steps.map((step) => ({
        id: createId(),
        sequenceId: created.id,
        ...stepColumns({ ...step, flowId: null }),
      }))
      await ctx.tx.insert(sequenceStepModel).values(stepRows)
      for (const [index, step] of entry.steps.entries()) {
        flowRefs.defer({
          sourceEntryId: entry.sourceId,
          field: `steps.${step.order}.flowId`,
          sourceFlowId: step.flowId,
          write: async (tx, flowId) => {
            await tx
              .update(sequenceStepModel)
              .set({ flowId })
              .where(eq(sequenceStepModel.id, stepRows[index].id))
          },
        })
      }
    }

    return flowRefs.tasks()
  },

  sync: {
    async project(tx, resourceId) {
      return await readContent(tx, resourceId)
    },

    async serializeBackup(tx, resourceId) {
      const content = await readContent(tx, resourceId)
      return content ? { formatVersion: BACKUP_FORMAT_VERSION, content } : null
    },

    async restoreBackup(tx, resourceId, content, formatVersion) {
      assertBackupFormat(formatVersion, BACKUP_FORMAT_VERSION)
      const parsed = sequenceContentSchema.safeParse(content)
      if (!parsed.success) {
        throw templateBackupNotRestorableException()
      }
      const [row] = await tx
        .select({
          workspaceId: sequenceModel.workspaceId,
          name: sequenceModel.name,
        })
        .from(sequenceModel)
        .where(eq(sequenceModel.id, resourceId))
        .limit(1)
      if (!row) {
        return
      }
      // A step's flow may have been deleted since; it must be a flow of the
      // copy's own workspace. The old name may have been taken since.
      const flows = await existingFlowIds(
        tx,
        row.workspaceId,
        parsed.data.steps.map((step) => step.flowId),
      )
      const name = (await nameTakenByOther(
        findSequencesByName(tx, row.workspaceId),
        parsed.data.name,
        resourceId,
      ))
        ? row.name
        : parsed.data.name
      await tx
        .update(sequenceModel)
        .set({ name })
        .where(eq(sequenceModel.id, resourceId))
      await writeSteps(
        tx,
        resourceId,
        parsed.data.steps.map((step) => ({
          ...step,
          flowId: step.flowId && flows.has(step.flowId) ? step.flowId : null,
        })),
      )
    },

    // The on/off switch, the folder, the subscribers and the contacts running
    // through the steps are the installer's and the system's; only what the
    // sequence is (its name and steps) comes from the template.
    async update(ctx, pairs) {
      for (const { entry, resourceId } of pairs) {
        const current = await readContent(ctx.tx, resourceId)
        if (!current) {
          continue
        }
        const name = await resolveSyncedName(ctx, {
          category: "sequences",
          sourceId: entry.sourceId,
          resourceId,
          currentName: current.name,
          wantedName: entry.name,
          findByName: findSequencesByName(ctx.tx, ctx.workspaceId),
        })
        await ctx.tx
          .update(sequenceModel)
          .set({ name })
          .where(eq(sequenceModel.id, resourceId))
        await writeSteps(
          ctx.tx,
          resourceId,
          entry.steps.map((step) => ({
            ...step,
            flowId: resolveRef(ctx, {
              category: "sequences",
              kind: "flow",
              path: `sequences.${entry.sourceId}.steps.${step.order}.flowId`,
              sourceRef: step.flowId,
            }),
          })),
        )
      }
    },
  } satisfies ResourceSyncHandler<TemplateSequenceEntry>,

  collector: makeCollector({
    findIds: (query) =>
      db.query.sequenceModel.findMany({
        where: scopedWhere(query),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.sequenceModel.findMany({
        where: scopedWhere({ workspaceId, ids }),
      })
      // One query for every step of every selected sequence.
      const steps = (
        await db.query.sequenceStepModel.findMany({
          where: { sequenceId: { in: rows.map((row) => row.id) } },
          orderBy: { order: "asc" },
        })
      ).filter(isContentStep)
      const stepsBySequence = Map.groupBy(steps, (step) => step.sequenceId)

      const entries = rows.map((row) => ({
        sourceId: row.id,
        name: row.name,
        active: row.active,
        folderId: row.folderId,
        steps: (stepsBySequence.get(row.id) ?? []).map(stepEntryOf),
      }))

      // A step's message is its flow: report them so the snapshot ships the
      // flows a sequence sends (and, through the flows, anything they use).
      return {
        entries,
        folderIds: rows.flatMap((row) => (row.folderId ? [row.folderId] : [])),
        hardDependencies: dependenciesOn(
          "flows",
          steps.map((step) => step.flowId),
        ),
      }
    },
  }),
}
