import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import type {
  FolderType,
  TemplateCategory,
} from "@chatbotx.io/database/partials"
import {
  templateInstallationModel,
  templateInstalledResourceModel,
} from "@chatbotx.io/database/schema"
import { updateTriggerCache } from "@chatbotx.io/events"
import type {
  TemplateExport,
  TemplateFolderManifestEntry,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { aiAgentService } from "../ai-agent/service"
import { automatedResponseService } from "../automated-response/service"
import { customFieldService } from "../custom-field/service"
import { toPublicErrorMessage } from "../errors"
import { folderService } from "../folder"
import { resolveCustomFieldManifest } from "./adapters/manifests/custom-fields"
import { resolveFolderManifest } from "./adapters/manifests/folders"
import { resolveProductCategoryManifest } from "./adapters/manifests/product-categories"
import { resolveTagManifest } from "./adapters/manifests/tags"
import {
  TEMPLATE_INSTALL_ORDER,
  templateAdapterRegistry,
} from "./adapters/registry"
import type {
  PatchTask,
  TemplateInstallContext,
  TemplateInstallWarning,
} from "./adapters/types"

const MAX_STORED_WARNINGS = 200

type TrackedResource = {
  category: TemplateCategory
  resourceKind: string
  resourceId: string
  sourceResourceId: string
  wasExisting: boolean
}

/**
 * Every folder-manifest entry is annotated with the category it actually
 * belongs to, so `resolveFolderManifest`'s provenance/warnings land on the
 * right category rather than a hardcoded one — see `manifests/folders.ts`.
 */
type FolderManifestByCategory = Partial<
  Record<TemplateCategory, TemplateExport["manifests"]["folders"]>
>

const groupFoldersByCategory = (
  folders: TemplateExport["manifests"]["folders"],
): FolderManifestByCategory => {
  const grouped: FolderManifestByCategory = {}
  for (const [sourceId, entry] of Object.entries(folders)) {
    const category = folderTypeToCategory(entry.folderType)
    const bucket = grouped[category] ?? {}
    bucket[sourceId] = entry
    grouped[category] = bucket
  }
  return grouped
}

/**
 * Maps a folder's `folderType` back to the template category that owns it,
 * for provenance/warning attribution only — install ordering for folders
 * themselves is unaffected (all folders resolve in Phase R, before any
 * category-specific ordering applies).
 */
const folderTypeToCategory = (folderType: string): TemplateCategory => {
  switch (folderType) {
    case "automatedResponse":
    case "outboundAutomatedResponse":
      return "keywords"
    case "trigger":
      return "triggers"
    case "customField":
      return "settings"
    default:
      return "flows"
  }
}

/**
 * Flattens `resources.settings.{savedReplies,botFields}` into one array with
 * an injected `kind` discriminator, matching `settingsAdapter`'s expected
 * entry shape — the only category whose stored resources aren't already a
 * flat array of `{sourceId, ...}` rows.
 */
const flattenSettingsEntries = (
  settings: TemplateExport["resources"]["settings"],
): (Record<string, unknown> & { sourceId: string })[] => [
  ...settings.savedReplies.map((entry) => ({ ...entry, kind: "savedReply" })),
  ...settings.botFields.map((entry) => ({ ...entry, kind: "botField" })),
]

const entriesForCategory = (
  resources: TemplateExport["resources"],
  category: TemplateCategory,
): (Record<string, unknown> & { sourceId: string })[] => {
  if (category === "settings") {
    return flattenSettingsEntries(resources.settings)
  }
  const value = resources[category as keyof typeof resources]
  return Array.isArray(value)
    ? (value as (Record<string, unknown> & { sourceId: string })[])
    : []
}

/**
 * Builds the mutable `TemplateInstallContext` shared across all three
 * phases. `track`/`warn` are synchronous accumulators — no adapter awaits
 * them — so the actual `TemplateInstalledResource` batch insert happens
 * once, explicitly, after tracked rows accumulate (see `flushTracked`
 * below) rather than as an unawaited per-call side effect racing the
 * transaction commit.
 */
const createInstallContext = (
  tx: DatabaseClient,
  installationId: string,
  workspaceId: string,
): {
  ctx: TemplateInstallContext
  tracked: TrackedResource[]
  warnings: TemplateInstallWarning[]
  resourceCount: { value: number }
} => {
  const tracked: TrackedResource[] = []
  const warnings: TemplateInstallWarning[] = []
  const resourceCount = { value: 0 }

  const ctx: TemplateInstallContext = {
    tx,
    workspaceId,
    installationId,
    idMaps: {},
    track: (entry) => {
      tracked.push(entry)
      resourceCount.value++
    },
    warn: (warning) => {
      if (warnings.length < MAX_STORED_WARNINGS) {
        warnings.push(warning)
      }
    },
  }

  return { ctx, tracked, warnings, resourceCount }
}

const flushTracked = async (
  tx: DatabaseClient,
  installationId: string,
  workspaceId: string,
  tracked: TrackedResource[],
): Promise<void> => {
  if (tracked.length === 0) {
    return
  }
  await tx.insert(templateInstalledResourceModel).values(
    tracked.map((entry) => ({
      id: createId(),
      installationId,
      workspaceId,
      category: entry.category,
      resourceKind: entry.resourceKind,
      resourceId: entry.resourceId,
      sourceResourceId: entry.sourceResourceId,
      wasExisting: entry.wasExisting,
    })),
  )
  tracked.length = 0
}

type RunInstallResult = {
  status: "completed" | "partial"
  warnings: TemplateInstallWarning[]
  resourceCount: number
  installFolderId: string | null
}

/**
 * When the source template has `createInstallFolder` enabled, creates one
 * root folder per distinct `FolderType` present in the manifest, pre-seeds
 * `ctx.idMaps.folder` with each root's id under a synthetic sourceId, and
 * rewrites every root-level entry (`parentSourceId: null`) to point at that
 * synthetic sourceId — so `resolveFolderManifest` nests it under the new
 * root without ever needing a fabricated manifest entry of its own.
 *
 * Threading the parent through at manifest-resolution time (rather than
 * `folderService.changeFolder` after the fact) avoids the
 * `automatedResponse`/`outboundAutomatedResponse` shared-table scoping trap
 * documented on `FolderService.changeFolder` (AGENTS.md invariant #17).
 *
 * Returns the first created root folder id (for display on
 * `TemplateInstallation.installFolderId`) — categories sharing one
 * `FolderType` (e.g. Keywords' two automatedResponse variants) still nest
 * under the same single root per type.
 */
const nestManifestUnderInstallFolders = async (
  ctx: TemplateInstallContext,
  templateName: string,
  folders: Readonly<Record<string, TemplateFolderManifestEntry>>,
): Promise<{
  folders: Record<string, TemplateFolderManifestEntry>
  installFolderId: string | null
}> => {
  const folderTypesUsed = new Set(
    Object.values(folders).map((entry) => entry.folderType),
  )
  if (folderTypesUsed.size === 0) {
    return { folders: { ...folders }, installFolderId: null }
  }

  if (!ctx.idMaps.folder) {
    ctx.idMaps.folder = new Map()
  }
  const idMap = ctx.idMaps.folder

  const rootSourceIdByFolderType = new Map<string, string>()
  let firstRootId: string | null = null
  for (const folderType of folderTypesUsed) {
    const root = await folderService.create({
      workspaceId: ctx.workspaceId,
      data: {
        name: templateName,
        parentId: null,
        folderType: folderType as FolderType,
      },
      tx: ctx.tx,
    })
    const rootSourceId = `__installRoot:${folderType}`
    idMap.set(rootSourceId, root.id)
    rootSourceIdByFolderType.set(folderType, rootSourceId)
    firstRootId ??= root.id
  }

  const nested = Object.fromEntries(
    Object.entries(folders).map(([sourceId, entry]) => [
      sourceId,
      entry.parentSourceId === null
        ? {
            ...entry,
            parentSourceId:
              rootSourceIdByFolderType.get(entry.folderType) ?? null,
          }
        : entry,
    ]),
  )

  return { folders: nested, installFolderId: firstRootId }
}

/**
 * Phase R (manifests) -> Phase 1 (adapters, in `TEMPLATE_INSTALL_ORDER`) ->
 * Phase 2 (drain every returned `PatchTask`) — all inside one transaction,
 * with provenance rows written inside it. A partial install has no
 * compensating-delete story across 15+ tables, so anything short of a full
 * commit means the whole install rolls back; per-resource failures (a
 * webchat's quota exhaustion, an unresolved reference) degrade to a
 * `warnings` entry instead of throwing.
 */
const runInstall = async (
  tx: DatabaseClient,
  input: {
    installationId: string
    workspaceId: string
    payload: TemplateExport
    templateName: string
    createInstallFolder: boolean
  },
): Promise<RunInstallResult> => {
  const { ctx, tracked, warnings, resourceCount } = createInstallContext(
    tx,
    input.installationId,
    input.workspaceId,
  )

  let installFolderId: string | null = null
  let folderManifest = input.payload.manifests.folders
  if (input.createInstallFolder) {
    const nested = await nestManifestUnderInstallFolders(
      ctx,
      input.templateName,
      folderManifest,
    )
    folderManifest = nested.folders
    installFolderId = nested.installFolderId
  }

  const foldersByCategory = groupFoldersByCategory(folderManifest)
  for (const [category, folders] of Object.entries(foldersByCategory)) {
    await resolveFolderManifest(ctx, folders, category as TemplateCategory)
  }
  await resolveCustomFieldManifest(ctx, input.payload.manifests.customFields)
  await resolveTagManifest(ctx, input.payload.manifests.tags)
  await resolveProductCategoryManifest(
    ctx,
    input.payload.manifests.productCategories,
  )
  await flushTracked(tx, input.installationId, input.workspaceId, tracked)

  const patchTasks: PatchTask[] = []
  for (const category of TEMPLATE_INSTALL_ORDER) {
    const adapter =
      templateAdapterRegistry[category as keyof typeof templateAdapterRegistry]
    if (!adapter) {
      continue
    }
    const entries = entriesForCategory(input.payload.resources, category)
    if (entries.length === 0) {
      continue
    }
    const tasks = await adapter.insert(ctx, entries)
    patchTasks.push(...tasks)
    await flushTracked(tx, input.installationId, input.workspaceId, tracked)
  }

  for (const task of patchTasks) {
    await task.apply(ctx)
  }
  await flushTracked(tx, input.installationId, input.workspaceId, tracked)

  return {
    status: warnings.length > 0 ? "partial" : "completed",
    warnings,
    resourceCount: resourceCount.value,
    installFolderId,
  }
}

/**
 * Cache tags touched by an install, drained by the caller strictly after
 * the transaction commits — invalidating inside `tx` risks repopulating
 * Redis from an uncommitted read, exactly as `importFlowExport` documents.
 * Covers every category whose adapter can insert a resource with its own
 * cache layer: custom fields, keywords (automatedResponse), triggers, and AI
 * agents. An installed trigger or AI agent was previously served stale until
 * something else evicted it.
 */
const invalidateAfterCommit = async (workspaceId: string): Promise<void> => {
  await Promise.all([
    customFieldService.invalidate({ workspaceId }),
    automatedResponseService.invalidateCache(workspaceId),
    updateTriggerCache(workspaceId),
    aiAgentService.invalidate({ workspaceId }),
  ])
}

export const templateInstallService = {
  /**
   * Runs the full install inside one transaction; writes `status` (
   * `installing` -> `completed`/`partial`) before commit. On any thrown
   * error the transaction rolls back entirely and `status: "failed"` is
   * written in a SEPARATE transaction afterward (the `importService.fail`
   * pattern) — a rolled-back transaction cannot itself carry the failure
   * record.
   */
  async run(input: {
    installationId: string
    workspaceId: string
    payload: TemplateExport
    templateName: string
    createInstallFolder: boolean
  }): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(templateInstallationModel)
          .set({ status: "installing" })
          .where(eq(templateInstallationModel.id, input.installationId))

        const outcome = await runInstall(tx, input)

        await tx
          .update(templateInstallationModel)
          .set({
            status: outcome.status,
            warnings: outcome.warnings,
            warningCount: outcome.warnings.length,
            resourceCount: outcome.resourceCount,
            installFolderId: outcome.installFolderId,
            completedAt: new Date(),
          })
          .where(eq(templateInstallationModel.id, input.installationId))
      })

      await invalidateAfterCommit(input.workspaceId)
    } catch (error) {
      await db
        .update(templateInstallationModel)
        .set({
          status: "failed",
          errorMessage: toPublicErrorMessage(error, "Template install failed"),
          completedAt: new Date(),
        })
        .where(eq(templateInstallationModel.id, input.installationId))
      throw error
    }
  },
}
