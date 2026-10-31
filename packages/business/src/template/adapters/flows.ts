import { and, type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { flowVersionRepository } from "@chatbotx.io/database/repositories"
import { flowModel, flowVersionModel } from "@chatbotx.io/database/schema"
import type {
  FlowExportedFlow,
  TemplateFlowEntry,
} from "@chatbotx.io/flow-config"
import {
  collectReferencesByKind,
  flowVersionSchema,
  normalizeFlowGraphDecisionMappings,
  remapFlowGraphReferences,
  type UnresolvedReference,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { isNumericId } from "@chatbotx.io/utils/id"
import { z } from "zod"
import { decisionProfileService } from "../../decision/profile-service"
import { flowService } from "../../flow"
import { flowVersionService } from "../../flow-version"
import { assertFlowGraphPublishable } from "../../flow-version/assert-publishable"
import { omitKeys } from "../fingerprint"
import { collectResourceDependencies } from "../manifest-references"
import {
  copyReferenceKinds,
  type ReferenceExistenceCache,
  sanitizeFlowGraphReferences,
} from "../reference-sanitizer"
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

/** Fields the installer owns: a sync never writes them, and they never enter the fingerprint. */
const FLOW_INSTALLER_OWNED_FIELDS = [
  "active",
  "enableInInbox",
  "folderId",
] as const

const FLOW_INSERT_KINDS = [
  "customField",
  "botField",
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
  "product",
  "webhook",
  "aiFunction",
  "aiFile",
  "aiMcpServer",
  "pipeline",
  "pipelineStage",
  "pipelineField",
  "workspaceMember",
  "inboxTeam",
  // Not remapped through an id map; reported when unresolved so the sanitizer
  // can verify each against the target workspace.
  "vendor",
  "productCategory",
  "decisionProfile",
  "userPersistentMenu",
  "leaderboard",
  "miniApp",
]

// `trigger` cannot be in `FLOW_INSERT_KINDS`: `triggers` inserts *after*
// flows in Phase 1 (a trigger's own actions can reference a flow), so a
// flow -> trigger reference (e.g. `Condition.sourceId` with
// `sourceType: "trigger"`) would create a real dependency cycle between the
// `flows` and `triggers` categories if resolved eagerly. Deferred to the
// same Phase-2 patch task as `flow`/`flowNode`.
const FLOW_DEFERRED_KINDS = ["flow", "flowNode", "trigger"]

/**
 * Flows adapter — reuses `flowService.createFromImport` verbatim, exactly as
 * single-flow import does. Its safety property (node ids reused as-is is
 * safe because every nodeId-keyed table also scopes by a freshly-minted
 * flowId) holds identically here, so there is zero new flow-insert code.
 *
 * Flows insert after every other Phase-1 category because every flow -> X
 * reference is either a manifest kind (already resolved in Phase R) or a
 * nullable/jsonb soft reference — never a NOT NULL FK — so a flow can always
 * be inserted even when some of its own references (to categories inserted
 * later in Phase 1, or to other flows in this same template) are not yet
 * resolvable.
 *
 * `flow`/`flowNode` are the two *deferred* kinds: a flow may reference
 * another flow that is also part of this template but has not been created
 * yet at the point this flow inserts. Since node ids are reused verbatim,
 * the `flowNode` idMap is the identity map once every referenced flow
 * exists. The returned `PatchTask` re-runs the remap restricted to
 * `["flow", "flowNode"]` against every flow's *own* draft version, once all
 * flows in this install have a target id — then writes the result straight
 * onto the draft row (a flow installed live has its published
 * version patched identically).
 */
export const flowsAdapter: ResourceAdapter<TemplateFlowEntry> = {
  category: "flows",
  providesKinds: ["flow"],
  consumesKinds: [...FLOW_INSERT_KINDS, ...FLOW_DEFERRED_KINDS],
  deferredKinds: FLOW_DEFERRED_KINDS,
  trackedKind: "flow",
  folderTypes: ["flow", "tag", "webhook", "emailTopic"],
  minFormatVersion: 1,
  fingerprint: {
    project: (entry) => omitKeys(entry, FLOW_INSTALLER_OWNED_FIELDS),
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateFlowEntry[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.flow) {
      ctx.idMaps.flow = new Map()
    }
    const flowIdMap = ctx.idMaps.flow
    const insertedFlowIds: string[] = []
    const sourceIdByFlowId = new Map<string, string>()
    const publishedFlowIds = new Set<string>()
    const existenceCache: ReferenceExistenceCache = new Map()

    for (const entry of entries) {
      const prepared = await prepareFlowGraph({
        ctx,
        entry,
        kinds: FLOW_INSERT_KINDS,
        cache: existenceCache,
      })
      if (!prepared) {
        continue
      }
      const { graph } = prepared

      const requestedFolderId = resolveFolderReference(ctx, entry)

      // Live only when the source was live and the installed graph can run:
      // otherwise a draft the installer publishes after fixing it.
      const publishable =
        entry.published === true &&
        prepared.resolvedCompletely &&
        (await isGraphPublishable(ctx, graph))
      // A flow that ends up draft-only is always reported, whether the source
      // was never published or could not be published as installed.
      if (!publishable) {
        ctx.warn({
          category: "flows",
          entityKind: "flowNotPublished",
          path: `flows.${entry.sourceId}`,
          value: entry.sourceId,
        })
      }

      const flowId = await flowService.createFromImport({
        workspaceId: ctx.workspaceId,
        name: entry.name,
        active: publishable ? entry.active : false,
        enableInInbox: entry.enableInInbox,
        startNodeId: entry.startNodeId,
        nodes: graph.nodes,
        edges: graph.edges,
        folderId: requestedFolderId,
        tx: ctx.tx,
        validatePublishable: false,
        publishedToo: publishable,
      })
      if (publishable) {
        publishedFlowIds.add(flowId)
      }

      flowIdMap.set(entry.sourceId, flowId)
      sourceIdByFlowId.set(flowId, entry.sourceId)
      registerIdentityNodeIds(ctx, entry)
      insertedFlowIds.push(flowId)
      ctx.track({
        category: "flows",
        resourceKind: "flow",
        resourceId: flowId,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [
      {
        category: "flows",
        apply: async (patchCtx) => {
          for (const flowId of insertedFlowIds) {
            const draft = await flowVersionService.findDraft(
              { flowId, workspaceId: patchCtx.workspaceId },
              patchCtx.tx,
            )
            if (!draft) {
              continue
            }
            // Warnings are keyed by the source id, like the same warning at insert.
            const sourceId = sourceIdByFlowId.get(flowId) ?? flowId
            const unresolved: UnresolvedReference[] = []
            let flowWarnings = 0
            const warnForFlow: typeof patchCtx.warn = (warning) => {
              flowWarnings += 1
              patchCtx.warn(warning)
            }
            const remapped = remapFlowGraphReferences(
              { nodes: draft.nodes, edges: draft.edges },
              patchCtx.idMaps,
              {
                kinds: FLOW_DEFERRED_KINDS,
                onUnresolved: (ref) => {
                  unresolved.push(ref)
                  warnForFlow({
                    category: "flows",
                    entityKind: ref.entityKind,
                    path: `flows.${sourceId}.${ref.path}`,
                    value: ref.value,
                  })
                },
              },
            )
            // Every flow of the template exists by now, so a flow, node or
            // trigger id still unresolved names something the template does
            // not carry: it is removed rather than left at the source's id.
            const sanitized = await sanitizeFlowGraphReferences({
              workspaceId: patchCtx.workspaceId,
              graph: remapped,
              unresolved,
              tx: patchCtx.tx,
              removeKinds: new Set(FLOW_DEFERRED_KINDS),
            })
            for (const path of [
              ...sanitized.removed,
              ...sanitized.droppedElements,
              ...sanitized.blocked,
            ]) {
              warnForFlow({
                category: "flows",
                entityKind: "referenceRemoved",
                path: `flows.${sourceId}.${path}`,
                value: sourceId,
              })
            }
            const patched = sanitized.value
            // Publication is decided here, after the deferred references were
            // resolved: a flow whose patch had to warn (an unresolved or
            // removed reference) must not run live with a graph that was
            // changed, so it is kept as a draft, like one that never could
            // be published.
            const goesLive = publishedFlowIds.has(flowId) && flowWarnings === 0
            if (publishedFlowIds.has(flowId) && !goesLive) {
              await demoteToDraft(patchCtx.tx, flowId)
              patchCtx.warn({
                category: "flows",
                entityKind: "flowNotPublished",
                path: `flows.${sourceId}`,
                value: sourceId,
              })
            }
            // The published copy carries the same deferred references, so it
            // is patched with the draft rather than left pointing at source ids.
            await patchCtx.tx
              .update(flowVersionModel)
              .set({ nodes: patched.nodes, edges: patched.edges })
              .where(
                goesLive
                  ? eq(flowVersionModel.flowId, flowId)
                  : eq(flowVersionModel.id, draft.id),
              )
            // A flow installed live is published: report it, so the caller runs
            // the same after-publish effects as for a manual publish once the
            // transaction has committed.
            if (patchCtx.publishedFlows && goesLive) {
              const live = await patchCtx.tx.query.flowModel.findFirst({
                where: { id: flowId },
                columns: { currentVersionId: true },
              })
              if (live?.currentVersionId) {
                patchCtx.publishedFlows.push({
                  flowId,
                  versionId: live.currentVersionId,
                })
              }
            }
          }
        },
      },
    ]
  },

  sync: {
    async project(tx, resourceId) {
      const flow = await tx.query.flowModel.findFirst({
        where: { id: resourceId },
        columns: { name: true },
      })
      const draft = await readDraft(tx, resourceId)
      if (!(flow && draft)) {
        return null
      }
      return {
        name: flow.name,
        startNodeId: draft.startNodeId,
        nodes: draft.nodes,
        edges: draft.edges,
      }
    },

    async serializeBackup(tx, resourceId) {
      const flow = await tx.query.flowModel.findFirst({
        where: { id: resourceId },
        columns: { name: true, currentVersionId: true },
      })
      const draft = await readDraft(tx, resourceId)
      if (!(flow && draft)) {
        return null
      }
      return {
        formatVersion: BACKUP_FORMAT_VERSION,
        content: {
          name: flow.name,
          // Whether the copy was live, so a restore knows what it replaced.
          published: Boolean(flow.currentVersionId),
          startNodeId: draft.startNodeId,
          nodes: draft.nodes,
          edges: draft.edges,
        },
      }
    },

    // Into the draft only, structurally checked: publishing stays a separate,
    // explicit action, so a restored incomplete graph can never go live.
    async restoreBackup(tx, resourceId, content, formatVersion) {
      assertBackupFormat(formatVersion, BACKUP_FORMAT_VERSION)
      const parsed = flowBackupSchema.safeParse(content)
      if (!parsed.success) {
        throw new Error("The flow backup is not in a restorable shape")
      }
      await writeDraft(tx, resourceId, parsed.data)
    },

    async update(ctx, pairs) {
      const existenceCache: ReferenceExistenceCache = new Map()
      // A jump into another updated flow resolves whatever order they go in.
      for (const { entry } of pairs) {
        registerIdentityNodeIds(ctx, entry)
      }
      // A flow this sync leaves alone (an edited copy it backs off from, a
      // detached one) keeps its nodes: a jump into one of them is valid.
      await registerInstalledCopyNodeIds(ctx)
      for (const { entry, resourceId } of pairs) {
        const prepared = await prepareFlowGraph({
          ctx,
          entry,
          kinds: [...FLOW_INSERT_KINDS, ...FLOW_DEFERRED_KINDS],
          cache: existenceCache,
        })
        if (!prepared) {
          continue
        }
        const { graph } = prepared
        const hadPublished = await writeDraft(ctx.tx, resourceId, {
          name: entry.name,
          startNodeId: entry.startNodeId,
          nodes: graph.nodes,
          edges: graph.edges,
        })
        if (hadPublished) {
          await republish(ctx, entry, resourceId, graph)
        }
      }
    },
  } satisfies ResourceSyncHandler<TemplateFlowEntry>,

  collector: {
    async resolveIds(workspaceId, limit) {
      const rows = await db.query.flowModel.findMany({
        where: { workspaceId },
        columns: { id: true },
        limit,
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      return await verifyOwnedIds(ids, (uniqueIds) =>
        db.query.flowModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
          columns: { id: true },
        }),
      )
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return EMPTY_COLLECT_RESULT
      }
      const rows = await db.query.flowModel.findMany({
        where: { workspaceId, id: { in: [...ids] } },
        columns: {
          id: true,
          name: true,
          active: true,
          enableInInbox: true,
          folderId: true,
        },
      })
      // One query for every flow's published-or-draft version, not two per flow.
      const versions = await flowVersionRepository.findPreferredByFlowIds({
        workspaceId,
        flowIds: rows.map((flow) => flow.id),
      })
      const versionByFlowId = new Map(
        versions.map((version) => [version.flowId, version]),
      )
      const entries = rows.flatMap((flow) => {
        const version = versionByFlowId.get(flow.id)
        return version ? [buildFlowExportEntry(flow, version)] : []
      })

      const folderIds = rows.flatMap((flow) =>
        flow.folderId ? [flow.folderId] : [],
      )

      // Account Fields a flow names (slots and `{{bot_field:<id>}}` tokens) are
      // collected for every category by `buildTemplateSnapshot`, not here.
      // A flow that subscribes a contact to a sequence, starts a questionnaire
      // or issues a coupon is useless without it, so what its steps name
      // travels with it.
      const dependencies: TemplateHardDependency[] = []
      for (const entry of entries) {
        dependencies.push(
          ...collectResourceDependencies({
            nodes: entry.nodes,
            edges: entry.edges,
          }),
        )
      }
      const hardDependencies: TemplateHardDependency[] = dependencies

      return {
        entries,
        folderIds,
        productCategoryIds: collectReferencedProductCategoryIds(entries),
        hardDependencies,
      }
    },
  } satisfies ResourceCollector,
}

/**
 * A backup is the installer's own draft, so it is checked for the structure a
 * restore could corrupt (ids, edge endpoints), not for publishability: an
 * unfinished graph is a legitimate thing to get back.
 */
const flowBackupSchema = z
  .object({
    name: z.string(),
    published: z.boolean().optional(),
    startNodeId: z.string(),
    nodes: z.array(z.looseObject({ id: z.string() })),
    edges: z.array(
      z.looseObject({ id: z.string(), source: z.string(), target: z.string() }),
    ),
  })
  .superRefine((backup, context) => {
    const nodeIds = new Set(backup.nodes.map((node) => node.id))
    if (nodeIds.size !== backup.nodes.length) {
      context.addIssue({ code: "custom", message: "Duplicate node id" })
    }
    if (backup.nodes.length > 0 && !nodeIds.has(backup.startNodeId)) {
      context.addIssue({ code: "custom", message: "Unknown start node" })
    }
    const edgeIds = new Set(backup.edges.map((edge) => edge.id))
    if (edgeIds.size !== backup.edges.length) {
      context.addIssue({ code: "custom", message: "Duplicate edge id" })
    }
    for (const edge of backup.edges) {
      if (!(nodeIds.has(edge.source) && nodeIds.has(edge.target))) {
        context.addIssue({
          code: "custom",
          message: `Edge ${edge.id} points at a missing node`,
        })
      }
    }
  })

type FlowDraftContent = {
  name: string
  startNodeId: string
  nodes: unknown[]
  edges: unknown[]
}

/**
 * Takes a just-inserted live flow back to a draft: no current version, not
 * active, and the published copy removed (nothing else references a version
 * created in this same transaction).
 */
const demoteToDraft = async (
  tx: DatabaseClient,
  flowId: string,
): Promise<void> => {
  await tx
    .update(flowModel)
    .set({ currentVersionId: null, active: false })
    .where(eq(flowModel.id, flowId))
  await tx
    .delete(flowVersionModel)
    .where(
      and(
        eq(flowVersionModel.flowId, flowId),
        eq(flowVersionModel.isDraft, false),
      ),
    )
}

/** The flow's draft, with its row locked for the rest of the transaction. */
const readDraft = async (tx: DatabaseClient, flowId: string) => {
  const [draft] = await tx
    .select()
    .from(flowVersionModel)
    .where(
      and(
        eq(flowVersionModel.flowId, flowId),
        eq(flowVersionModel.isDraft, true),
      ),
    )
    .for("update")
    .limit(1)
  return draft
}

/** Writes the draft; returns whether the flow also has a published version. */
const writeDraft = async (
  tx: DatabaseClient,
  flowId: string,
  content: FlowDraftContent,
): Promise<boolean> => {
  const [flow] = await tx
    .update(flowModel)
    .set({ name: content.name })
    .where(eq(flowModel.id, flowId))
    .returning({ currentVersionId: flowModel.currentVersionId })
  await tx
    .update(flowVersionModel)
    .set({
      startNodeId: content.startNodeId,
      nodes: content.nodes as FlowExportedFlow["nodes"],
      edges: content.edges as FlowExportedFlow["edges"],
    })
    .where(
      and(
        eq(flowVersionModel.flowId, flowId),
        eq(flowVersionModel.isDraft, true),
      ),
    )
  return Boolean(flow?.currentVersionId)
}

/**
 * A flow that was live stays live on the new content: the updated graph is
 * published as a new version when it is publishable, and otherwise the old
 * published version keeps running with a warning. Published versions are
 * immutable, so this adds one rather than editing the current.
 */
const republish = async (
  ctx: TemplateInstallContext,
  entry: TemplateFlowEntry,
  flowId: string,
  graph: Pick<FlowDraftContent, "nodes" | "edges">,
): Promise<void> => {
  const nodes = normalizeFlowGraphDecisionMappings(
    graph.nodes as FlowExportedFlow["nodes"],
  )
  try {
    assertFlowGraphPublishable({
      nodes,
      edges: graph.edges as FlowExportedFlow["edges"],
    })
    await decisionProfileService.assertFlowReferencesPublishable({
      nodes,
      workspaceId: ctx.workspaceId,
    })
  } catch {
    ctx.warn({
      category: "flows",
      entityKind: "flowNotPublished",
      path: `flows.${entry.sourceId}`,
      value: entry.sourceId,
    })
    return
  }
  const versionId = createId()
  // Like a manual publish, the draft keeps the normalized graph too.
  await ctx.tx
    .update(flowVersionModel)
    .set({ nodes })
    .where(
      and(
        eq(flowVersionModel.flowId, flowId),
        eq(flowVersionModel.isDraft, true),
      ),
    )
  await ctx.tx
    .update(flowVersionModel)
    .set({ isLatest: false })
    .where(
      and(
        eq(flowVersionModel.flowId, flowId),
        eq(flowVersionModel.isLatest, true),
      ),
    )
  await ctx.tx.insert(flowVersionModel).values({
    id: versionId,
    workspaceId: ctx.workspaceId,
    flowId,
    isDraft: false,
    isLatest: true,
    nodes,
    edges: graph.edges as FlowExportedFlow["edges"],
    startNodeId: entry.startNodeId,
  })
  await ctx.tx
    .update(flowModel)
    .set({ currentVersionId: versionId })
    .where(eq(flowModel.id, flowId))
  ctx.publishedFlows?.push({ flowId, versionId })
}

/**
 * The product categories flows filter by (`sendCollection` category and
 * sub-category). Reported so the snapshot ships them in the
 * `productCategories` manifest: without that the install could never resolve
 * them, and the sanitizer would clear the filter, widening the step to the
 * whole store.
 */
const collectReferencedProductCategoryIds = (
  entries: readonly unknown[],
): string[] => {
  const ids = new Set<string>()
  for (const entry of entries) {
    for (const id of collectReferencesByKind(entry, ["productCategory"]).get(
      "productCategory",
    ) ?? []) {
      if (isNumericId(id)) {
        ids.add(id)
      }
    }
  }
  return [...ids]
}

/**
 * Builds one `flows` resource entry in the shape `flowsAdapter.insert`
 * expects. The snapshot carries the latest *published* graph, or the draft
 * when the flow was never published ("blocking a template on one unpublished
 * flow is hostile"); `published` records which, so the install can restore the
 * live state only when it is safe to.
 */
const buildFlowExportEntry = (
  flow: {
    id: string
    name: string
    active: boolean
    enableInInbox: boolean
    folderId: string | null
  },
  version: {
    startNodeId: string
    nodes: unknown
    edges: unknown
    isDraft: boolean
  },
): Record<string, unknown> & { sourceId: string } => ({
  sourceId: flow.id,
  // `findPreferredByFlowIds` returns the latest published version when there is
  // one and the draft otherwise, so a draft here means the flow was never live.
  published: !version.isDraft,
  name: flow.name,
  active: flow.active,
  enableInInbox: flow.enableInInbox,
  startNodeId: version.startNodeId,
  nodes: version.nodes as FlowExportedFlow["nodes"],
  edges: version.edges as FlowExportedFlow["edges"],
  folderId: flow.folderId,
})

/**
 * `createFromImport` reuses node ids verbatim (safe because every
 * nodeId-keyed table also scopes by the freshly-minted flowId), so the
 * `flowNode` id map is the identity map for every node of an installed flow.
 * Without it the deferred patch pass warned for every cross-flow node jump.
 */
const registerIdentityNodeIds = (
  ctx: TemplateInstallContext,
  entry: TemplateFlowEntry,
): void => {
  const nodeIdMap = ctx.idMaps.flowNode ?? new Map<string, string>()
  ctx.idMaps.flowNode = nodeIdMap
  for (const node of entry.nodes) {
    nodeIdMap.set(node.id, node.id)
  }
}

/** Registers the node ids of every installed flow copy the maps know, whether or not this run touches it. */
const registerInstalledCopyNodeIds = async (
  ctx: TemplateInstallContext,
): Promise<void> => {
  const copyIds = [...(ctx.idMaps.flow?.values() ?? [])]
  if (copyIds.length === 0) {
    return
  }
  const versions = await ctx.tx.query.flowVersionModel.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      flowId: { in: copyIds },
      OR: [{ isDraft: true }, { isLatest: true }],
    },
    columns: { nodes: true },
  })
  const nodeIdMap = ctx.idMaps.flowNode ?? new Map<string, string>()
  ctx.idMaps.flowNode = nodeIdMap
  for (const version of versions) {
    for (const node of version.nodes) {
      nodeIdMap.set(node.id, node.id)
    }
  }
}

const resolveFolderReference = (
  ctx: TemplateInstallContext,
  entry: TemplateFlowEntry,
): string | null =>
  resolveRef(ctx, {
    category: "flows",
    kind: "folder",
    path: `flows.${entry.sourceId}.folderId`,
    sourceRef: entry.folderId,
    ignore: [rootFolderId],
  })

const isGraphPublishable = async (
  ctx: TemplateInstallContext,
  graph: Pick<FlowDraftContent, "nodes" | "edges">,
): Promise<boolean> => {
  const nodes = normalizeFlowGraphDecisionMappings(
    graph.nodes as FlowExportedFlow["nodes"],
  )
  try {
    assertFlowGraphPublishable({
      nodes,
      edges: graph.edges as FlowExportedFlow["edges"],
    })
    await decisionProfileService.assertFlowReferencesPublishable({
      nodes,
      workspaceId: ctx.workspaceId,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Remaps a flow's references and sanitizes what no map resolved. Returns
 * `null` after warning when the flow cannot be installed: a required slot that
 * cannot be dropped with an element (`flowSkippedRequiredReference`), or a
 * graph that is not structurally valid (`flowInvalidStructure`).
 */
const prepareFlowGraph = async (input: {
  ctx: TemplateInstallContext
  entry: TemplateFlowEntry
  kinds: readonly string[]
  cache: ReferenceExistenceCache
}): Promise<{
  graph: { nodes: FlowExportedFlow["nodes"]; edges: FlowExportedFlow["edges"] }
  resolvedCompletely: boolean
} | null> => {
  const { ctx, entry } = input
  const unresolved: UnresolvedReference[] = []
  const remapped = remapFlowGraphReferences(
    { nodes: entry.nodes, edges: entry.edges },
    ctx.idMaps,
    {
      kinds: input.kinds,
      onUnresolved: (ref) => {
        unresolved.push(ref)
        ctx.warn({
          category: "flows",
          entityKind: ref.entityKind,
          path: `flows.${entry.sourceId}.${ref.path}`,
          value: ref.value,
        })
      },
    },
  )
  // A reference no map resolved is never left pointing at the source
  // workspace's id: it is removed in the way its slot allows.
  const sanitized = await sanitizeFlowGraphReferences({
    workspaceId: ctx.workspaceId,
    graph: remapped,
    unresolved,
    tx: ctx.tx,
    cache: input.cache,
    // A shipped kind the install has already created cannot be left at the
    // source's id; one that resolves later (`flow`...) is judged by the patch.
    removeKinds: new Set(
      input.kinds.filter((kind) => copyReferenceKinds().has(kind)),
    ),
  })
  if (sanitized.blocked.length > 0) {
    ctx.warn({
      category: "flows",
      entityKind: "flowSkippedRequiredReference",
      path: `flows.${entry.sourceId}.${sanitized.blocked[0]}`,
      value: entry.sourceId,
    })
    return null
  }
  for (const path of [...sanitized.removed, ...sanitized.droppedElements]) {
    ctx.warn({
      category: "flows",
      entityKind: "referenceRemoved",
      path: `flows.${entry.sourceId}.${path}`,
      value: entry.sourceId,
    })
  }
  if (!z.array(flowVersionSchema).safeParse(sanitized.value.nodes).success) {
    ctx.warn({
      category: "flows",
      entityKind: "flowInvalidStructure",
      path: `flows.${entry.sourceId}`,
      value: entry.sourceId,
    })
    return null
  }
  return {
    graph: sanitized.value,
    resolvedCompletely: unresolved.length === 0,
  }
}
