import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import type { AutomatedResponseType } from "@chatbotx.io/database/partials"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import { z } from "zod"
import { automatedResponseService } from "../../automated-response/service"
import { omitKeys } from "../fingerprint"
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
  TemplateHardDependency,
  TemplateInstallContext,
} from "./types"

/** The shape `serializeBackup` writes and `restoreBackup` reads. */
const BACKUP_FORMAT_VERSION = 1

type TemplateKeywordEntry = {
  sourceId: string
  type: AutomatedResponseType
  text: string | null
  keywords: string[]
  // Points at a `resources.flows` sourceId — flows insert *before* keywords
  // in Phase 1, so this resolves directly (no deferral needed).
  flowId: string | null
  // Points at a `manifests.folders` sourceId, resolved via `idMaps.folder`.
  // The folder manifest entry MUST have been keyed on `(name, folderType)`
  // matching this row's own `type` (`automatedResponseFolderTypeByType`) —
  // see `adapters/manifests/folders.ts` for the invariant this depends on.
  folderId: string | null
}

/** Fields the installer owns: a sync never writes them, and they never enter the fingerprint. */
const KEYWORD_INSTALLER_OWNED_FIELDS = ["folderId"] as const

/** What a template update overwrites on an installed keyword. */
const keywordContentSchema = z.object({
  text: z.string().nullable(),
  keywords: z.array(z.string()),
  flowId: z.string().nullable(),
})
type KeywordContent = z.infer<typeof keywordContentSchema>

const readContent = async (
  tx: DatabaseClient,
  resourceId: string,
): Promise<KeywordContent | null> => {
  // Locked for the rest of the transaction: an uninstall or sync decides from
  // this read, so a concurrent edit has to wait instead of being lost.
  const [row] = await tx
    .select()
    .from(automatedResponseModel)
    .where(eq(automatedResponseModel.id, resourceId))
    .for("update")
    .limit(1)
  return row
    ? { text: row.text, keywords: row.keywords, flowId: row.flowId }
    : null
}

/** The comparison form: a keyword list is a set, so its order is not content. */
const comparable = (content: KeywordContent): KeywordContent => ({
  ...content,
  keywords: [...content.keywords].sort(),
})

/**
 * Keywords (`AutomatedResponse`) insert after flows, so `flowId` resolves
 * directly. `folderId` resolves against the folder manifest — this is the
 * category most exposed to the "one table, two FolderTypes" bug: an
 * inbound keyword whose `folderId` sourceId was captured against an
 * `automatedResponse`-typed folder must land in that same folder, never in
 * the `outboundAutomatedResponse`-typed folder of the same name.
 */
export const keywordsAdapter: ResourceAdapter<TemplateKeywordEntry> = {
  category: "keywords",
  providesKinds: [],
  consumesKinds: ["flow", "folder"],
  deferredKinds: [],
  trackedKind: "automatedResponse",
  folderTypes: ["automatedResponse", "outboundAutomatedResponse"],
  minFormatVersion: 1,
  fingerprint: {
    project: (entry) => omitKeys(entry, KEYWORD_INSTALLER_OWNED_FIELDS),
    unorderedPaths: ["keywords"],
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateKeywordEntry[],
  ): Promise<PatchTask[]> {
    for (const entry of entries) {
      const flowId = resolveReference(
        ctx,
        "flow",
        entry.sourceId,
        "flowId",
        entry.flowId,
      )
      const folderId = resolveReference(
        ctx,
        "folder",
        entry.sourceId,
        "folderId",
        entry.folderId,
      )

      const created = await automatedResponseService.create(
        ctx.workspaceId,
        {
          type: entry.type,
          text: entry.text,
          flowId,
          folderId,
          keywords: entry.keywords,
        },
        ctx.tx,
      )

      ctx.track({
        category: "keywords",
        resourceKind: "automatedResponse",
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
      return content ? comparable(content) : null
    },

    async serializeBackup(tx, resourceId) {
      const content = await readContent(tx, resourceId)
      return content ? { formatVersion: BACKUP_FORMAT_VERSION, content } : null
    },

    async restoreBackup(tx, resourceId, content, formatVersion) {
      assertBackupFormat(formatVersion, BACKUP_FORMAT_VERSION)
      const parsed = keywordContentSchema.safeParse(content)
      if (!parsed.success) {
        throw new Error("The keyword backup is not in a restorable shape")
      }
      const backup = parsed.data
      const [row] = await tx
        .select({ workspaceId: automatedResponseModel.workspaceId })
        .from(automatedResponseModel)
        .where(eq(automatedResponseModel.id, resourceId))
        .limit(1)
      // The flow may have been deleted since, and must belong to the copy's
      // own workspace; restore the rest without it.
      const flowExists =
        backup.flowId && row
          ? Boolean(
              await tx.query.flowModel.findFirst({
                where: { id: backup.flowId, workspaceId: row.workspaceId },
                columns: { id: true },
              }),
            )
          : false
      await tx
        .update(automatedResponseModel)
        .set({ ...backup, flowId: flowExists ? backup.flowId : null })
        .where(eq(automatedResponseModel.id, resourceId))
    },

    // The folder is the installer's; only what the keyword says and does is
    // the template's. An unresolvable flow clears the reply flow.
    async update(ctx, pairs) {
      for (const { entry, resourceId } of pairs) {
        const flowId = resolveReference(
          ctx,
          "flow",
          entry.sourceId,
          "flowId",
          entry.flowId,
        )
        await ctx.tx
          .update(automatedResponseModel)
          .set({ text: entry.text, keywords: entry.keywords, flowId })
          .where(eq(automatedResponseModel.id, resourceId))
      }
    },
  } satisfies ResourceSyncHandler<TemplateKeywordEntry>,

  collector: {
    async resolveIds(workspaceId, limit) {
      // "keywords" is the inbound half of `AutomatedResponse` — the
      // outbound half backs the unrelated "Page Automated Responses"
      // comment-automation feature, which has no export category of its
      // own. Without this filter, exporting "keywords" would silently
      // bundle a workspace's outbound rows too. Mirrors
      // `automatedResponseService.list`'s always-required `type` filter.
      const rows = await db.query.automatedResponseModel.findMany({
        where: { workspaceId, type: "inbound" },
        columns: { id: true },
        limit,
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      return await verifyOwnedIds(ids, (uniqueIds) =>
        db.query.automatedResponseModel.findMany({
          where: { workspaceId, type: "inbound", id: { in: uniqueIds } },
          columns: { id: true },
        }),
      )
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return EMPTY_COLLECT_RESULT
      }
      const rows = await db.query.automatedResponseModel.findMany({
        where: { workspaceId, type: "inbound", id: { in: [...ids] } },
      })
      const entries = rows.map((row) => ({
        sourceId: row.id,
        type: row.type,
        text: row.text,
        keywords: row.keywords,
        flowId: row.flowId,
        folderId: row.folderId,
      }))
      const folderIds = rows.flatMap((row) =>
        row.folderId ? [row.folderId] : [],
      )

      // A keyword fires its flow, so the flow travels with it rather than the
      // install warning about a reply that points nowhere.
      const hardDependencies: TemplateHardDependency[] = [
        ...new Set(rows.flatMap((row) => (row.flowId ? [row.flowId] : []))),
      ].map((sourceId) => ({ category: "flows", sourceId }))

      return {
        entries,
        folderIds,
        productCategoryIds: [],
        hardDependencies,
      }
    },
  } satisfies ResourceCollector,
}

const resolveReference = (
  ctx: TemplateInstallContext,
  entityKind: string,
  sourceId: string,
  field: string,
  refSourceId: string | null,
): string | null =>
  resolveRef(ctx, {
    category: "keywords",
    kind: entityKind,
    path: `keywords.${sourceId}.${field}`,
    sourceRef: refSourceId,
  })
