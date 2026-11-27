import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import { z } from "zod"
import { aiFunctionService } from "../../ai-function/service"
import { templateBackupNotRestorableException } from "../template-errors"
import {
  assertBackupFormat,
  createFlowRefPatcher,
  dependenciesOn,
  existingFlowIds,
  makeCollector,
  recordCopy,
  resolveRef,
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
    const flowRefs = createFlowRefPatcher("aiFunctions")

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

      flowRefs.defer({
        sourceEntryId: entry.sourceId,
        field: "triggerFlowId",
        sourceFlowId: entry.triggerFlowId,
        write: async (tx, triggerFlowId) => {
          await tx
            .update(aiFunctionModel)
            .set({ triggerFlowId })
            .where(eq(aiFunctionModel.id, created.id))
        },
      })
      recordCopy(ctx, {
        category: "aiFunctions",
        resourceKind: "aiFunction",
        idMapKind: "aiFunction",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })
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
      const parsed = aiFunctionContentSchema.safeParse(content)
      if (!parsed.success) {
        throw templateBackupNotRestorableException()
      }
      const backup = contentColumns(parsed.data)
      const [row] = await tx
        .select({ workspaceId: aiFunctionModel.workspaceId })
        .from(aiFunctionModel)
        .where(eq(aiFunctionModel.id, resourceId))
        .limit(1)
      // The trigger flow may have been deleted since, and must belong to the
      // copy's own workspace; restore the rest without it.
      const flows = row
        ? await existingFlowIds(tx, row.workspaceId, [backup.triggerFlowId])
        : new Set<string>()
      const flowExists = backup.triggerFlowId
        ? flows.has(backup.triggerFlowId)
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
        const triggerFlowId = resolveRef(ctx, {
          category: "aiFunctions",
          kind: "flow",
          path: `aiFunctions.${entry.sourceId}.triggerFlowId`,
          sourceRef: entry.triggerFlowId,
        })
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

  collector: makeCollector({
    findIds: (query) =>
      db.query.aiFunctionModel.findMany({
        where: scopedWhere(query),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.aiFunctionModel.findMany({
        where: scopedWhere({ workspaceId, ids }),
      })
      const entries = rows.map((row) => ({
        sourceId: row.id,
        name: row.name,
        purpose: row.purpose,
        dataCollect: row.dataCollect,
        outputMessage: row.outputMessage,
        triggerFlowId: row.triggerFlowId,
      }))

      // The flow the function triggers travels with it, like a keyword's flow.
      return {
        entries,
        hardDependencies: dependenciesOn(
          "flows",
          rows.map((row) => row.triggerFlowId),
        ),
      }
    },
  }),
}
