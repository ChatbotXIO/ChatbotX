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
import { insertWithCopyName, nameStartsWith } from "./naming"
import {
  assertBackupFormat,
  EMPTY_COLLECT_RESULT,
  existingFlowIds,
  resolveRef,
  verifyOwnedIds,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  ResourceSyncHandler,
  TemplateHardDependency,
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
  return {
    name: row.name,
    steps: steps.map((step) => ({
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
    })),
  }
}

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
 * (`lastStepId`/`nextStepId`) and their dispatch history stay attached. Steps
 * beyond the new count are removed (their dispatch rows go with them); extra
 * new steps are inserted. The step counter follows the step count.
 */
const writeSteps = async (
  tx: DatabaseClient,
  sequenceId: string,
  steps: readonly StepContent[],
): Promise<void> => {
  const existing = await tx.query.sequenceStepModel.findMany({
    where: { sequenceId },
    orderBy: { order: "asc", id: "asc" },
    columns: { id: true },
  })
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
      .delete(sequenceStepModel)
      .where(inArray(sequenceStepModel.id, surplus))
  }
  await tx
    .update(sequenceModel)
    .set({ messages: steps.length })
    .where(eq(sequenceModel.id, sequenceId))
}

/** True when another sequence of the workspace already has `name` (unique per workspace). */
const nameTakenByOther = async (
  tx: DatabaseClient,
  input: { workspaceId: string; name: string; resourceId: string },
): Promise<boolean> => {
  const rows = await tx.query.sequenceModel.findMany({
    where: { workspaceId: input.workspaceId, name: input.name },
    columns: { id: true },
  })
  return rows.some((row) => row.id !== input.resourceId)
}

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

const resolveFolderRef = (
  ctx: TemplateInstallContext,
  entry: TemplateSequenceEntry,
): string | null =>
  resolveRef(ctx, {
    category: "sequences",
    kind: "folder",
    path: `sequences.${entry.sourceId}.folderId`,
    sourceRef: entry.folderId,
  })

/**
 * A sequence is copied with its steps and nothing that happened to the
 * source: no subscribers, no dispatch history, and the `subscribers` /
 * `messages` counters start from what was actually inserted. Names are unique
 * per workspace, so a collision gets the shared retry-on-conflict suffix.
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
    if (!ctx.idMaps.sequence) {
      ctx.idMaps.sequence = new Map()
    }
    const idMap = ctx.idMaps.sequence
    // step id -> source flow id, patched in Phase 2
    const pendingStepFlows = new Map<string, string>()

    for (const entry of entries) {
      const folderId = resolveFolderRef(ctx, entry)

      const created = await insertWithCopyName({
        tx: ctx.tx,
        constraint: "Sequence_workspaceId_name_key",
        name: entry.name,
        loadTakenNames: async (tx, prefix) =>
          (
            await tx.query.sequenceModel.findMany({
              where: {
                workspaceId: ctx.workspaceId,
                name: nameStartsWith(prefix),
              },
              columns: { name: true },
            })
          ).map((row) => row.name),
        insert: (tx, candidateName) =>
          tx
            .insert(sequenceModel)
            .values({
              id: createId(),
              workspaceId: ctx.workspaceId,
              name: candidateName,
              active: entry.active,
              folderId,
              subscribers: 0,
              messages: entry.steps.length,
            })
            .returning()
            .then(([row]) => row),
        onGiveUp: (lastAttemptedName) =>
          ctx.warn({
            category: "sequences",
            entityKind: "name",
            path: `sequences.${entry.sourceId}.name`,
            value: lastAttemptedName,
          }),
      })
      if (!created) {
        continue
      }

      idMap.set(entry.sourceId, created.id)
      ctx.track({
        category: "sequences",
        resourceKind: "sequence",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })

      if (entry.steps.length === 0) {
        continue
      }
      const stepRows = entry.steps.map((step) => ({
        id: createId(),
        sequenceId: created.id,
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
        flowId: null,
      }))
      await ctx.tx.insert(sequenceStepModel).values(stepRows)
      entry.steps.forEach((step, index) => {
        if (step.flowId) {
          pendingStepFlows.set(stepRows[index].id, step.flowId)
        }
      })
    }

    return [
      {
        category: "sequences",
        apply: async (patchCtx) => {
          for (const [stepId, flowSourceId] of pendingStepFlows) {
            const targetFlowId = patchCtx.idMaps.flow?.get(flowSourceId)
            if (!targetFlowId) {
              patchCtx.warn({
                category: "sequences",
                entityKind: "flow",
                path: `sequences.steps.${stepId}.flowId`,
                value: flowSourceId,
              })
              continue
            }
            await patchCtx.tx
              .update(sequenceStepModel)
              .set({ flowId: targetFlowId })
              .where(eq(sequenceStepModel.id, stepId))
          }
        },
      },
    ]
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
        throw new Error("The sequence backup is not in a restorable shape")
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
      const name = (await nameTakenByOther(tx, {
        workspaceId: row.workspaceId,
        name: parsed.data.name,
        resourceId,
      }))
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
        const nameTaken =
          entry.name !== current.name &&
          (await nameTakenByOther(ctx.tx, {
            workspaceId: ctx.workspaceId,
            name: entry.name,
            resourceId,
          }))
        if (nameTaken) {
          ctx.warn({
            category: "sequences",
            entityKind: "name",
            path: `sequences.${entry.sourceId}.name`,
            value: entry.name,
          })
        }
        await ctx.tx
          .update(sequenceModel)
          .set({ name: nameTaken ? current.name : entry.name })
          .where(eq(sequenceModel.id, resourceId))
        await writeSteps(
          ctx.tx,
          resourceId,
          entry.steps.map((step) => ({
            order: step.order,
            delayDays: step.delayDays,
            delayMinutes: step.delayMinutes,
            delayUnit: step.delayUnit,
            specificDateTime: step.specificDateTime,
            isActive: step.isActive,
            anytime: step.anytime,
            sendTimeStart: step.sendTimeStart,
            sendTimeEnd: step.sendTimeEnd,
            sendDays: step.sendDays,
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

  collector: {
    async resolveIds(workspaceId, limit) {
      const rows = await db.query.sequenceModel.findMany({
        where: { workspaceId },
        columns: { id: true },
        limit,
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      return await verifyOwnedIds(ids, (uniqueIds) =>
        db.query.sequenceModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
          columns: { id: true },
        }),
      )
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return EMPTY_COLLECT_RESULT
      }
      const rows = await db.query.sequenceModel.findMany({
        where: { workspaceId, id: { in: [...ids] } },
      })
      // One query for every step of every selected sequence.
      const steps = await db.query.sequenceStepModel.findMany({
        where: { sequenceId: { in: rows.map((row) => row.id) } },
        orderBy: { order: "asc" },
      })
      const stepsBySequence = Map.groupBy(steps, (step) => step.sequenceId)

      const entries = rows.map((row) => ({
        sourceId: row.id,
        name: row.name,
        active: row.active,
        folderId: row.folderId,
        steps: (stepsBySequence.get(row.id) ?? []).map((step) => ({
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
        })),
      }))

      // A step's message is its flow: report them so the snapshot ships the
      // flows a sequence sends (and, through the flows, anything they use).
      const hardDependencies: TemplateHardDependency[] = [
        ...new Set(steps.flatMap((step) => (step.flowId ? [step.flowId] : []))),
      ].map((sourceId) => ({ category: "flows", sourceId }))

      return {
        entries,
        folderIds: rows.flatMap((row) => (row.folderId ? [row.folderId] : [])),
        productCategoryIds: [],
        hardDependencies,
      }
    },
  } satisfies ResourceCollector,
}
