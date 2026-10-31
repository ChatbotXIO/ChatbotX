import { db } from "@chatbotx.io/database/client"
import type {
  FolderType,
  TemplateCategoryCounts,
  TemplateResourceCategory,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import { rootFolderId } from "@chatbotx.io/database/partials"
import {
  inboxRepository,
  pipelineRepository,
  productCategoryRepository,
} from "@chatbotx.io/database/repositories"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import {
  customFieldResolutionKey,
  customFieldTypes,
  planCustomFieldResolution,
} from "@chatbotx.io/utils/custom-field"
import { isBindableInbox } from "./adapters/manifests/inboxes"
import type { ManifestKey } from "./adapters/manifests/resolve"
import { templateAdapterRegistry } from "./adapters/registry"
import {
  type CollisionKind,
  MANIFEST_COLLISION_POLICY,
  type PredictedAction,
  predictAction,
} from "./collision-policy"
import { buildTemplateSnapshot } from "./snapshot.service"
import { entriesForCategory } from "./template-entries"

export type PredictedCollision = {
  manifest: CollisionKind
  sourceId: string
  name: string
  action: PredictedAction
  /** The existing target row the action reuses or binds, when there is one. */
  targetId?: string
}

const normalize = (name: string) => name.trim().toLowerCase()

const previewTags = async (
  workspaceId: string,
  manifest: TemplateExport["manifests"]["tags"],
): Promise<PredictedCollision[]> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return []
  }
  const rows = await db.query.tagModel.findMany({
    where: {
      workspaceId,
      deletedAt: { isNull: true as const },
      name: { in: entries.map(([, entry]) => entry.name.trim()) },
    },
    columns: { id: true, name: true },
  })
  const byName = new Map(rows.map((row) => [row.name, row.id]))
  return entries.map(([sourceId, entry]) => {
    const targetId = byName.get(entry.name.trim())
    return {
      manifest: "tags",
      sourceId,
      name: entry.name,
      action: predictAction("tags", { found: targetId !== undefined }),
      targetId,
    }
  })
}

const previewCustomFields = async (
  workspaceId: string,
  manifest: TemplateExport["manifests"]["customFields"],
): Promise<PredictedCollision[]> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return []
  }
  // Every field of the workspace, as the install reads them: the name fold
  // (case and whitespace) is applied below, so an exact-name SQL filter would
  // miss `Age` when the template ships `age`.
  const rows = await db.query.customFieldModel.findMany({
    where: { workspaceId },
    columns: { id: true, name: true, type: true },
  })
  // The plan the install executes, so the prediction cannot differ from it.
  const { plans } = planCustomFieldResolution(
    rows,
    entries.map(([, field]) => field),
  )
  const seen = new Set<string>()
  return entries.map(([sourceId, field]) => {
    const key = customFieldResolutionKey(field)
    const plan = plans.get(key)
    // Fields of one template that fold to one key become a single row; the
    // later ones reuse what the first creates.
    const duplicate = seen.has(key)
    seen.add(key)
    const action: PredictedAction =
      duplicate || plan?.action === "reuse"
        ? "reuse"
        : predictAction("customFields", {
            found: false,
            sameNameOtherType: plan?.action === "rename",
          })
    return {
      manifest: "customFields",
      sourceId,
      name: field.name,
      action,
      targetId: plan?.action === "reuse" ? plan.row.id : undefined,
    }
  })
}

const previewBotFields = async (
  workspaceId: string,
  entries: readonly ({ sourceId: string } & Record<string, unknown>)[],
): Promise<PredictedCollision[]> => {
  // A shipped entry is loosely typed JSON: a name or type that is not usable is
  // skipped here, as the install skips it.
  const botFields = entries.flatMap((entry) => {
    const type = customFieldTypes.safeParse(entry.type)
    return typeof entry.name === "string" && type.success
      ? [{ sourceId: entry.sourceId, name: entry.name, type: type.data }]
      : []
  })
  if (botFields.length === 0) {
    return []
  }
  const rows = await db.query.botFieldModel.findMany({
    where: { workspaceId },
    columns: { id: true, name: true, type: true },
  })
  const fields = botFields
  // The same planner the install runs, so the prediction cannot differ from it.
  const { plans } = planCustomFieldResolution(rows, fields)
  const seen = new Set<string>()
  return fields.map((field) => {
    const key = customFieldResolutionKey(field)
    const plan = plans.get(key)
    const duplicate = seen.has(key)
    seen.add(key)
    const action: PredictedAction =
      duplicate || plan?.action === "reuse"
        ? "reuse"
        : predictAction("botFields", {
            found: false,
            sameNameOtherType: plan?.action === "rename",
          })
    return {
      manifest: "botFields",
      sourceId: field.sourceId,
      name: field.name,
      action,
      targetId: plan?.action === "reuse" ? plan.row.id : undefined,
    }
  })
}

const previewProductCategories = async (
  workspaceId: string,
  manifest: TemplateExport["manifests"]["productCategories"],
): Promise<PredictedCollision[]> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return []
  }
  const existing = await productCategoryRepository.list(workspaceId)
  // `null` = will be created, so its children are created too.
  const resolved = new Map<string, string | null>()
  const result = new Map<string, PredictedCollision>()
  const remaining = new Map(entries)
  for (let pass = 0; pass < entries.length && remaining.size > 0; pass++) {
    for (const [sourceId, entry] of remaining) {
      const parent = entry.parentSourceId
      if (parent && !resolved.has(parent)) {
        continue
      }
      const parentTarget = parent ? (resolved.get(parent) ?? null) : null
      const found =
        parent && parentTarget === null
          ? undefined
          : existing.find(
              (row) =>
                row.parentId === parentTarget &&
                normalize(row.name) === normalize(entry.name),
            )
      resolved.set(sourceId, found?.id ?? null)
      result.set(sourceId, {
        manifest: "productCategories",
        sourceId,
        name: entry.name,
        action: predictAction("productCategories", { found: Boolean(found) }),
        targetId: found?.id,
      })
      remaining.delete(sourceId)
    }
  }
  return [...result.values()]
}

const previewFolders = async (
  workspaceId: string,
  manifest: TemplateExport["manifests"]["folders"],
  createInstallFolder: boolean,
): Promise<PredictedCollision[]> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return []
  }
  // One batched read; the (type, name, parent) match runs in memory.
  const candidates = await db.query.folderModel.findMany({
    where: {
      workspaceId,
      folderType: {
        in: [
          ...new Set(entries.map(([, entry]) => entry.folderType)),
        ] as FolderType[],
      },
      name: { in: [...new Set(entries.map(([, entry]) => entry.name))] },
    },
    columns: { id: true, folderType: true, name: true, parentId: true },
  })
  const findCandidate = (
    entry: { folderType: string; name: string },
    parentId: string | null,
  ) =>
    candidates.find(
      (row) =>
        row.folderType === entry.folderType &&
        row.name === entry.name &&
        (row.parentId ?? null) === parentId,
    )
  // Under an install folder every top-level folder lands in a brand-new root.
  const resolved = new Map<string, string | null>()
  const result = new Map<string, PredictedCollision>()
  const remaining = new Map(entries)
  for (let pass = 0; pass < entries.length && remaining.size > 0; pass++) {
    for (const [sourceId, entry] of remaining) {
      const parent =
        !entry.parentSourceId || entry.parentSourceId === rootFolderId
          ? null
          : entry.parentSourceId
      if (parent && !resolved.has(parent)) {
        continue
      }
      const parentTarget = parent ? (resolved.get(parent) ?? null) : null
      const underNewParent =
        (parent && parentTarget === null) || (createInstallFolder && !parent)
      const found = underNewParent
        ? undefined
        : findCandidate(entry, parentTarget)
      resolved.set(sourceId, found?.id ?? null)
      result.set(sourceId, {
        manifest: "folders",
        sourceId,
        name: entry.name,
        action: predictAction("folders", { found: Boolean(found) }),
        targetId: found?.id,
      })
      remaining.delete(sourceId)
    }
  }
  return [...result.values()]
}

const previewPipelines = async (
  workspaceId: string,
  manifest: TemplateExport["manifests"]["pipelines"],
): Promise<PredictedCollision[]> =>
  await Promise.all(
    Object.entries(manifest).map(async ([sourceId, entry]) => {
      const found = await pipelineRepository.findByReferenceName({
        workspaceId,
        referenceName: entry.referenceName,
      })
      return {
        manifest: "pipelines" as const,
        sourceId,
        name: entry.name,
        action: predictAction("pipelines", { found: Boolean(found) }),
        targetId: found?.id,
      }
    }),
  )

const previewInboxes = async (
  workspaceId: string,
  manifest: TemplateExport["manifests"]["inboxes"],
  bindings: Readonly<Record<string, string>>,
): Promise<PredictedCollision[]> => {
  const entries = Object.entries(manifest)
  const candidates = await inboxRepository.listIdentitiesByIds({
    workspaceId,
    ids: entries.map(([sourceId]) => bindings[sourceId] ?? sourceId),
  })
  const byId = new Map(candidates.map((row) => [row.id, row]))
  return entries.map(([sourceId, entry]) => {
    const target = byId.get(bindings[sourceId] ?? sourceId)
    const bindable = target ? isBindableInbox(target, entry) : false
    return {
      manifest: "inboxes",
      sourceId,
      name: entry.name,
      action: predictAction("inboxes", { found: Boolean(target), bindable }),
      targetId: bindable ? target?.id : undefined,
    }
  })
}

/**
 * What an install of `payload` would do to each manifest entry in the target
 * workspace: reuse what exists, create what is missing, rename a custom field
 * whose name is taken by another type, bind or leave unbound an inbox. Read
 * only; the predictions follow `MANIFEST_COLLISION_POLICY`, the same table the
 * resolvers are tested against, so the preview cannot promise a different
 * behavior than the install delivers.
 */
export const previewInstallCollisions = async (input: {
  workspaceId: string
  manifests: TemplateExport["manifests"]
  /** The bot fields the template ships (`resources.settings.botFields`). */
  botFields?: readonly ({ sourceId: string } & Record<string, unknown>)[]
  createInstallFolder?: boolean
  inboxBindings?: Readonly<Record<string, string>>
}): Promise<{
  collisions: PredictedCollision[]
  /** `action` -> count, so a client can headline "3 reused, 2 created". */
  summary: Record<PredictedAction, number>
}> => {
  const { workspaceId, manifests } = input
  const groups = await Promise.all([
    previewFolders(
      workspaceId,
      manifests.folders,
      Boolean(input.createInstallFolder),
    ),
    previewCustomFields(workspaceId, manifests.customFields),
    previewBotFields(workspaceId, input.botFields ?? []),
    previewTags(workspaceId, manifests.tags),
    previewProductCategories(workspaceId, manifests.productCategories),
    previewPipelines(workspaceId, manifests.pipelines),
    previewInboxes(workspaceId, manifests.inboxes, input.inboxBindings ?? {}),
  ])
  const collisions = groups.flat()
  const summary: Record<PredictedAction, number> = {
    create: 0,
    reuse: 0,
    rename: 0,
    bind: 0,
    unbound: 0,
  }
  for (const collision of collisions) {
    summary[collision.action]++
  }
  return { collisions, summary }
}

/** Strategy and key per manifest, for a client that explains the rules. */
export const describeCollisionPolicy = () => MANIFEST_COLLISION_POLICY

export type PreviewedDependency = {
  category: TemplateResourceCategory
  sourceId: string
  /** What the editor lists the row as. */
  name: string
}

/**
 * A shipped entry's label, read from the snapshot it came from (one source of
 * truth, no per-row lookup): every category names its rows `name` except a
 * keyword (its words) and a saved reply (its shortcut).
 */
const displayNameOf = (entry: Record<string, unknown>): string => {
  for (const key of ["name", "shortcut"]) {
    const value = entry[key]
    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }
  const words = entry.keywords
  if (Array.isArray(words) && words.length > 0) {
    return words.filter((word) => typeof word === "string").join(", ")
  }
  return entry.sourceId as string
}

/**
 * What saving `selection` pulls in on its own: the rows another selected row
 * needs (a flow's sequence, a reflink's flow, ...) that were not selected, and
 * the manifests (tags, custom fields, product categories, folders, pipelines,
 * inboxes) the snapshot ships. Computed with the real snapshot, so the preview
 * cannot drift from what the save does. A category selected with `mode: "all"`
 * contributes no extra rows (everything is already in).
 */
export const previewDependencies = async (input: {
  workspaceId: string
  tenantId: string
  selection: TemplateSelection
}): Promise<{
  includedDependencies: PreviewedDependency[]
  manifests: { kind: ManifestKey; count: number; names: string[] }[]
  droppedReferenceCount: number
  /** What the save would count per category: the caller checks it against the actor, as save does. */
  categoryCounts: TemplateCategoryCounts
}> => {
  const { payload, droppedReferenceCount, categoryCounts } =
    await buildTemplateSnapshot(input)
  const includedDependencies: PreviewedDependency[] = []
  for (const category of Object.keys(
    templateAdapterRegistry,
  ) as TemplateResourceCategory[]) {
    const chosen = input.selection[category]
    if (chosen?.mode === "all") {
      continue
    }
    const selected = new Set(chosen?.mode === "ids" ? chosen.ids : [])
    for (const entry of entriesForCategory(payload.resources, category)) {
      if (!selected.has(entry.sourceId)) {
        includedDependencies.push({
          category,
          sourceId: entry.sourceId,
          name: displayNameOf(entry),
        })
      }
    }
  }
  const named = (manifest: Record<string, { name: string }>) =>
    Object.values(manifest).map((entry) => entry.name)
  const { manifests } = payload
  const summarize = (kind: ManifestKey, names: string[]) => ({
    kind,
    count: names.length,
    names,
  })
  return {
    includedDependencies,
    droppedReferenceCount,
    categoryCounts,
    manifests: [
      summarize("folders", named(manifests.folders)),
      summarize("customFields", named(manifests.customFields)),
      summarize("tags", named(manifests.tags)),
      summarize("productCategories", named(manifests.productCategories)),
      summarize("pipelines", named(manifests.pipelines)),
      summarize("inboxes", named(manifests.inboxes)),
    ].filter((group) => group.count > 0),
  }
}
