import { db } from "@chatbotx.io/database/client"
import type { AIFileChunkingConfig } from "@chatbotx.io/database/partials"
import { uploader } from "@chatbotx.io/filesystem"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { aiFileService } from "../../ai-file/service"
import { ChatbotXException } from "../../errors"
import { logger } from "../../logger"
import { aiFileObjectPrefix } from "../template-object-keys"
import {
  makeCollector,
  recordCopy,
  scopedWhere,
  updateNotSupported,
  warnStagedSkip,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  StagedObject,
  TemplateInstallContext,
  TemplateStageContext,
} from "./types"

/** One install copies at most this many bytes of knowledge files. */
export const TEMPLATE_AI_FILES_MAX_BYTES = 200 * 1000 * 1000

type TemplateAIFileEntry = {
  sourceId: string
  name: string
  path: string
  mimeType: string
  size: number
  chunkingConfig: AIFileChunkingConfig | null
}

/**
 * AI file objects live under their workspace's private `ai-files` prefix: an
 * upload directly, an installed copy under `tpl-<id>/g<n>/[<attempt>/]`.
 */
const COPYABLE_PATH_PATTERN =
  /^workspaces\/\d+\/ai-files\/(?:tpl-\d+\/g\d+\/(?:[^/]+\/)?)?[^/]+$/

/**
 * Copied only from the publishing workspace's own prefix: the worker copies
 * with its own privileges, so a path into any other workspace must never be
 * followed, whatever the payload says.
 */
export const isCopyablePath = (
  path: string,
  sourceWorkspaceId?: string,
): boolean =>
  COPYABLE_PATH_PATTERN.test(path) &&
  Boolean(sourceWorkspaceId) &&
  path.startsWith(`workspaces/${sourceWorkspaceId}/ai-files/`)

/** The slot `stage` and `insert` agree on for one AI file. */
const aiFileStageKey = (sourceId: string): string => `aiFiles:${sourceId}`

/**
 * Knowledge files are copied object-for-object and re-embedded in the
 * installing workspace: `stage` copies the bytes before the transaction, then
 * the row is written inside it with a `queued` run, and the embedding job is
 * dispatched after commit (see `ai-file-dispatch`). On a rollback the install
 * service deletes every object `stage` recorded.
 *
 * Without an OpenAI or Gemini integration nothing could ever be embedded, so
 * the files are skipped (once, for the whole list) rather than installed as
 * rows stuck in `queued`.
 */
export const aiFilesAdapter: ResourceAdapter<TemplateAIFileEntry> = {
  category: "aiFiles",
  providesKinds: ["aiFile"],
  consumesKinds: [],
  deferredKinds: [],
  trackedKind: "aiFile",
  folderTypes: [],
  minFormatVersion: 2,
  sync: updateNotSupported("aiFiles"),

  /**
   * Runs before the apply transaction: the object copies are storage I/O, which
   * must not sit inside it. Each target key derives from the installation and
   * the source object, so a retried install overwrites the same key instead of
   * orphaning a copy.
   */
  async stage(
    ctx: TemplateStageContext,
    entries: readonly TemplateAIFileEntry[],
  ): Promise<Map<string, StagedObject>> {
    const staged = new Map<string, StagedObject>()
    if (entries.length === 0) {
      return staged
    }

    try {
      await aiFileService.assertEmbeddingProviderConfigured(ctx.workspaceId)
    } catch (error) {
      if (!(error instanceof ChatbotXException)) {
        throw error
      }
      for (const entry of entries) {
        staged.set(aiFileStageKey(entry.sourceId), {
          skipped: "noEmbeddingProvider",
        })
      }
      return staged
    }

    let copiedBytes = 0
    for (const entry of entries) {
      const key = aiFileStageKey(entry.sourceId)
      if (!isCopyablePath(entry.path, ctx.sourceWorkspaceId)) {
        staged.set(key, { skipped: "aiFileUnavailable" })
        continue
      }
      if (copiedBytes + entry.size > TEMPLATE_AI_FILES_MAX_BYTES) {
        staged.set(key, { skipped: "aiFileTooLarge" })
        continue
      }

      const targetPath = `${aiFileObjectPrefix(ctx.workspaceId, ctx.installationId, ctx.scope)}${await sha256Hex(`${entry.sourceId}:${entry.path}`)}`
      try {
        await uploader.copyObject(entry.path, targetPath)
      } catch (error) {
        logger.warn(
          { err: error, sourceId: entry.sourceId },
          "Template install: AI file could not be copied",
        )
        staged.set(key, { skipped: "aiFileUnavailable" })
        continue
      }
      ctx.trackCopiedObject(targetPath)
      copiedBytes += entry.size
      staged.set(key, { targetPath })
    }
    return staged
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateAIFileEntry[],
  ): Promise<PatchTask[]> {
    for (const entry of entries) {
      const staged = ctx.staged?.get(aiFileStageKey(entry.sourceId))
      if (!staged || "skipped" in staged) {
        warnStagedSkip(ctx, {
          category: "aiFiles",
          staged,
          fallbackKind: "aiFileUnavailable",
          path: `aiFiles.${entry.sourceId}`,
          value: entry.name,
        })
        continue
      }

      const created = await aiFileService.createFromCopiedObject({
        tx: ctx.tx,
        workspaceId: ctx.workspaceId,
        name: entry.name,
        path: staged.targetPath,
        mimeType: entry.mimeType,
        size: entry.size,
        chunkingConfig: entry.chunkingConfig,
      })
      recordCopy(ctx, {
        category: "aiFiles",
        resourceKind: "aiFile",
        idMapKind: "aiFile",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })
    }

    return [] satisfies PatchTask[]
  },

  collector: makeCollector({
    findIds: (query) =>
      db.query.aiFileModel.findMany({
        where: scopedWhere(query),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.aiFileModel.findMany({
        where: scopedWhere({ workspaceId, ids }),
      })
      return {
        entries: rows.map((row) => ({
          sourceId: row.id,
          name: row.name,
          path: row.path,
          mimeType: row.mimeType,
          size: row.size,
          chunkingConfig: row.chunkingConfig,
        })),
      }
    },
  }),
}
