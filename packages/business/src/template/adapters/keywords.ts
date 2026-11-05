import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  type AutomatedResponseType,
  automatedResponseTypes,
  type KeywordCondition,
} from "@chatbotx.io/database/partials"
import { keywordConditionsSchema } from "@chatbotx.io/database/partials/keyword-condition-schema"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import { z } from "zod"
import {
  automatedResponseService,
  resolveKeywordRuleMatch,
} from "../../automated-response/service"
import { omitKeys } from "../fingerprint"
import { templateBackupNotRestorableException } from "../template-errors"
import {
  assertBackupFormat,
  dependenciesOn,
  existingFlowIds,
  makeCollector,
  recordCopy,
  resolveFolderRef,
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

type TemplateKeywordEntry = {
  sourceId: string
  type: AutomatedResponseType
  text: string | null
  keywords: string[]
  // Contact keyword match conditions. Absent on templates exported before
  // conditions existed — those install from `keywords` alone.
  conditions?: KeywordCondition[] | null
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
  // Optional: a backup taken before conditions existed has none. Kept loose
  // here; `validConditions` decides whether they can still be written.
  conditions: z.unknown().optional(),
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
    ? {
        text: row.text,
        keywords: row.keywords,
        conditions: row.conditions,
        flowId: row.flowId,
      }
    : null
}

/**
 * The conditions as the service accepts them today, or `null` when there are
 * none or they no longer validate (an operator renamed or a limit tightened
 * since they were written): the caller then falls back to the plain keywords.
 */
const validConditions = (conditions: unknown): KeywordCondition[] | null => {
  const parsed = keywordConditionsSchema.safeParse(conditions)
  return parsed.success && parsed.data.length > 0 ? parsed.data : null
}

/**
 * The `keywords`/`conditions` pair a template entry or backup writes, decided
 * by the service's own rule (one implementation): valid conditions when there
 * are any, else the plain keywords (one "contains" condition on a Contact
 * rule). Never throws on stored conditions that stopped validating.
 */
const matchOf = (
  type: AutomatedResponseType,
  source: { keywords: string[]; conditions?: unknown },
) => resolveKeywordRuleMatch(type, ruleInputOf(source))

/** What `create` takes: valid conditions, or else the plain keywords. */
const ruleInputOf = (source: { keywords: string[]; conditions?: unknown }) => {
  const conditions = validConditions(source.conditions)
  return conditions ? { conditions } : { keywords: source.keywords }
}

/** Warns when an entry's conditions could not be used and its keywords stood in. */
const warnIfConditionsDropped = (
  ctx: TemplateInstallContext,
  entry: TemplateKeywordEntry,
): void => {
  if (entry.conditions != null && !validConditions(entry.conditions)) {
    ctx.warn({
      category: "keywords",
      entityKind: "automatedResponse",
      path: `keywords.${entry.sourceId}.conditions`,
      value: entry.sourceId,
    })
  }
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
      const flowId = resolveFlowRef(ctx, entry)
      const folderId = resolveFolderRef(ctx, "keywords", entry)

      const created = await automatedResponseService.create(
        ctx.workspaceId,
        {
          type: entry.type,
          text: entry.text,
          flowId,
          folderId,
          // One of the two: `create` derives the other itself.
          ...ruleInputOf(entry),
        },
        ctx.tx,
      )
      warnIfConditionsDropped(ctx, entry)

      recordCopy(ctx, {
        category: "keywords",
        resourceKind: "automatedResponse",
        sourceId: entry.sourceId,
        resourceId: created.id,
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
        throw templateBackupNotRestorableException()
      }
      const backup = parsed.data
      const [row] = await tx
        .select({
          workspaceId: automatedResponseModel.workspaceId,
          type: automatedResponseModel.type,
        })
        .from(automatedResponseModel)
        .where(eq(automatedResponseModel.id, resourceId))
        .limit(1)
      // The flow may have been deleted since, and must belong to the copy's
      // own workspace; restore the rest without it.
      const flows = row
        ? await existingFlowIds(tx, row.workspaceId, [backup.flowId])
        : new Set<string>()
      const flowExists = backup.flowId ? flows.has(backup.flowId) : false
      const match = row
        ? matchOf(automatedResponseTypes.parse(row.type), backup)
        : { keywords: backup.keywords, conditions: null }
      await tx
        .update(automatedResponseModel)
        .set({
          text: backup.text,
          ...match,
          flowId: flowExists ? backup.flowId : null,
        })
        .where(eq(automatedResponseModel.id, resourceId))
    },

    // The folder is the installer's; only what the keyword says and does is
    // the template's. An unresolvable flow clears the reply flow.
    async update(ctx, pairs) {
      for (const { entry, resourceId } of pairs) {
        const flowId = resolveFlowRef(ctx, entry)
        await ctx.tx
          .update(automatedResponseModel)
          .set({ text: entry.text, ...matchOf(entry.type, entry), flowId })
          .where(eq(automatedResponseModel.id, resourceId))
        warnIfConditionsDropped(ctx, entry)
      }
    },
  } satisfies ResourceSyncHandler<TemplateKeywordEntry>,

  collector: makeCollector({
    // "keywords" is the inbound half of `AutomatedResponse` — the
    // outbound half backs the unrelated "Page Automated Responses"
    // comment-automation feature, which has no export category of its
    // own. Without this filter, exporting "keywords" would silently
    // bundle a workspace's outbound rows too. Mirrors
    // `automatedResponseService.list`'s always-required `type` filter.
    findIds: (query) =>
      db.query.automatedResponseModel.findMany({
        where: scopedWhere(query, { type: "inbound" as const }),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.automatedResponseModel.findMany({
        where: scopedWhere({ workspaceId, ids }, { type: "inbound" as const }),
      })
      const entries = rows.map((row) => ({
        sourceId: row.id,
        type: row.type,
        text: row.text,
        keywords: row.keywords,
        conditions: row.conditions,
        flowId: row.flowId,
        folderId: row.folderId,
      }))

      // A keyword fires its flow, so the flow travels with it rather than the
      // install warning about a reply that points nowhere.
      return {
        entries,
        folderIds: rows.flatMap((row) => (row.folderId ? [row.folderId] : [])),
        hardDependencies: dependenciesOn(
          "flows",
          rows.map((row) => row.flowId),
        ),
      }
    },
  }),
}

const resolveFlowRef = (
  ctx: TemplateInstallContext,
  entry: TemplateKeywordEntry,
): string | null =>
  resolveRef(ctx, {
    category: "keywords",
    kind: "flow",
    path: `keywords.${entry.sourceId}.flowId`,
    sourceRef: entry.flowId,
  })
