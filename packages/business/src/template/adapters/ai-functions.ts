import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import { z } from "zod"
import { aiFunctionService } from "../../ai-function/service"
import {
  assertBackupFormat,
  EMPTY_COLLECT_RESULT,
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

type TemplateAIFunctionEntry = {
  sourceId: string
  name: string
  purpose?: string | null
  dataCollect: Array<{ from: string; to: string }>
  outputMessage?: string | null
  // Points at a `resources.flows` sourceId — flows insert *after*
  // aiFunctions in Phase 1 (per install ordering), so this is always
  // deferred to Phase 2, never resolved at insert time.
  triggerFlowId?: string | null
}

/** What a template update overwrites on an installed function. */
const aiFunctionContentSchema = z.object({
  name: z.string(),
  purpose: z.string().nullable(),
  /** Stored as untyped jsonb; the template entry types it. */
  dataCollect: z.unknown(),
  outputMessage: z.string().nullable(),
  triggerFlowId: z.string().nullable(),
})
type AIFunctionContent = z.infer<typeof aiFunctionContentSchema>

const contentColumns = (content: AIFunctionContent): AIFunctionContent => ({
  name: content.name,
  purpose: content.purpose,
  dataCollect: content.dataCollect,
  outputMessage: content.outputMessage,
  triggerFlowId: content.triggerFlowId,
})

const readContent = async (
  tx: DatabaseClient,
  resourceId: string,
): Promise<AIFunctionContent | null> => {
  // Locked for the rest of the transaction (see the keywords adapter).
  const [row] = await tx
    .select()
    .from(aiFunctionModel)
    .where(eq(aiFunctionModel.id, resourceId))
    .for("update")
    .limit(1)
  return row ? contentColumns(row) : null
}

/**
 * AIFunctions insert with `triggerFlowId: null` — flows are inserted later
 * in Phase 1 (`products -> settings -> aiFunctions -> aiAgents -> calendars
 * -> webchats -> flows -> ...`), so the target flow id can never be known
 * yet. The returned `PatchTask` fixes it up (a single-column update, so
 * every other field written at insert time is left untouched) once
 * `idMaps.flow` is complete.
 */
export const aiFunctionsAdapter: ResourceAdapter<TemplateAIFunctionEntry> = {
  category: "aiFunctions",
  providesKinds: ["aiFunction"],
  consumesKinds: ["flow"],
  deferredKinds: ["flow"],
  trackedKind: "aiFunction",
  folderTypes: [],
  minFormatVersion: 1,

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateAIFunctionEntry[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.aiFunction) {
      ctx.idMaps.aiFunction = new Map()
    }
    const idMap = ctx.idMaps.aiFunction
    const pendingTriggerFlowBySourceId = new Map<string, string>()

    for (const entry of entries) {
      const [created] = await aiFunctionService.create(
        ctx.workspaceId,
        {
          name: entry.name,
          purpose: entry.purpose,
          dataCollect: entry.dataCollect,
          outputMessage: entry.outputMessage,
          triggerFlowId: null,
        },
        ctx.tx,
      )

      idMap.set(entry.sourceId, created.id)
      if (entry.triggerFlowId) {
        pendingTriggerFlowBySourceId.set(created.id, entry.triggerFlowId)
      }
      ctx.track({
        category: "aiFunctions",
        resourceKind: "aiFunction",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [
      {
        category: "aiFunctions",
        apply: async (patchCtx) => {
          for (const [
            aiFunctionId,
            flowSourceId,
          ] of pendingTriggerFlowBySourceId) {
            const targetFlowId = patchCtx.idMaps.flow?.get(flowSourceId)
            if (!targetFlowId) {
              patchCtx.warn({
                category: "aiFunctions",
                entityKind: "flow",
                path: `aiFunctions.${aiFunctionId}.triggerFlowId`,
                value: flowSourceId,
              })
              continue
            }
            await patchCtx.tx
              .update(aiFunctionModel)
              .set({ triggerFlowId: targetFlowId })
              .where(eq(aiFunctionModel.id, aiFunctionId))
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
      const parsed = aiFunctionContentSchema.safeParse(content)
      if (!parsed.success) {
        throw new Error("The AI function backup is not in a restorable shape")
      }
      const backup = contentColumns(parsed.data)
      const [row] = await tx
        .select({ workspaceId: aiFunctionModel.workspaceId })
        .from(aiFunctionModel)
        .where(eq(aiFunctionModel.id, resourceId))
        .limit(1)
      // The trigger flow may have been deleted since, and must belong to the
      // copy's own workspace; restore the rest without it.
      const flowExists =
        backup.triggerFlowId && row
          ? Boolean(
              await tx.query.flowModel.findFirst({
                where: {
                  id: backup.triggerFlowId,
                  workspaceId: row.workspaceId,
                },
                columns: { id: true },
              }),
            )
          : false
      await tx
        .update(aiFunctionModel)
        .set({
          ...backup,
          triggerFlowId: flowExists ? backup.triggerFlowId : null,
        })
        .where(eq(aiFunctionModel.id, resourceId))
    },

    // A flow that is no longer resolvable clears the trigger rather than
    // leaving the source workspace's id behind.
    async update(ctx, pairs) {
      for (const { entry, resourceId } of pairs) {
        const triggerFlowId = entry.triggerFlowId
          ? (ctx.idMaps.flow?.get(entry.triggerFlowId) ?? null)
          : null
        if (entry.triggerFlowId && !triggerFlowId) {
          ctx.warn({
            category: "aiFunctions",
            entityKind: "flow",
            path: `aiFunctions.${entry.sourceId}.triggerFlowId`,
            value: entry.triggerFlowId,
          })
        }
        await ctx.tx
          .update(aiFunctionModel)
          .set(
            contentColumns({
              name: entry.name,
              purpose: entry.purpose ?? null,
              dataCollect: entry.dataCollect,
              outputMessage: entry.outputMessage ?? null,
              triggerFlowId,
            }),
          )
          .where(eq(aiFunctionModel.id, resourceId))
      }
    },
  } satisfies ResourceSyncHandler<TemplateAIFunctionEntry>,

  collector: {
    async resolveIds(workspaceId, limit) {
      const rows = await db.query.aiFunctionModel.findMany({
        where: { workspaceId },
        columns: { id: true },
        limit,
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      return await verifyOwnedIds(ids, (uniqueIds) =>
        db.query.aiFunctionModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
          columns: { id: true },
        }),
      )
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return EMPTY_COLLECT_RESULT
      }
      const rows = await db.query.aiFunctionModel.findMany({
        where: { workspaceId, id: { in: [...ids] } },
      })
      const entries = rows.map((row) => ({
        sourceId: row.id,
        name: row.name,
        purpose: row.purpose,
        dataCollect: row.dataCollect,
        outputMessage: row.outputMessage,
        triggerFlowId: row.triggerFlowId,
      }))

      return {
        entries,
        folderIds: [],
        productCategoryIds: [],
        hardDependencies: [],
      }
    },
  } satisfies ResourceCollector,
}
