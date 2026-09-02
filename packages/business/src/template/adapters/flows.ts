import { db, eq } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { flowVersionModel } from "@chatbotx.io/database/schema"
import type {
  FlowExportedFlow,
  TemplateFlowEntry,
} from "@chatbotx.io/flow-config"
import {
  collectFieldReferences,
  remapFlowGraphReferences,
} from "@chatbotx.io/flow-config"
import { flowService } from "../../flow"
import { flowVersionService } from "../../flow-version"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateHardDependency,
  TemplateInstallContext,
} from "./types"

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
 * onto the draft row (never-published flows have no separate published
 * version to patch).
 */
export const flowsAdapter: ResourceAdapter = {
  category: "flows",
  providesKinds: ["flow"],
  consumesKinds: [...FLOW_INSERT_KINDS, ...FLOW_DEFERRED_KINDS],
  deferredKinds: FLOW_DEFERRED_KINDS,

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.flow) {
      ctx.idMaps.flow = new Map()
    }
    const flowIdMap = ctx.idMaps.flow
    const insertedFlowIds: string[] = []

    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateFlowEntry
      const remapped = remapFlowGraphReferences(
        { nodes: entry.nodes, edges: entry.edges },
        ctx.idMaps,
        {
          kinds: FLOW_INSERT_KINDS,
          onUnresolved: (ref) =>
            ctx.warn({
              category: "flows",
              entityKind: ref.entityKind,
              path: `flows.${entry.sourceId}.${ref.path}`,
              value: ref.value,
            }),
        },
      )

      const requestedFolderId = resolveFolderReference(ctx, entry)

      const flowId = await flowService.createFromImport({
        workspaceId: ctx.workspaceId,
        name: entry.name,
        active: entry.active,
        enableInInbox: entry.enableInInbox,
        startNodeId: entry.startNodeId,
        nodes: remapped.nodes,
        edges: remapped.edges,
        folderId: requestedFolderId,
        tx: ctx.tx,
      })

      flowIdMap.set(entry.sourceId, flowId)
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
            const patched = remapFlowGraphReferences(
              { nodes: draft.nodes, edges: draft.edges },
              patchCtx.idMaps,
              {
                kinds: FLOW_DEFERRED_KINDS,
                onUnresolved: (ref) =>
                  patchCtx.warn({
                    category: "flows",
                    entityKind: ref.entityKind,
                    path: `flows.${flowId}.${ref.path}`,
                    value: ref.value,
                  }),
              },
            )
            await patchCtx.tx
              .update(flowVersionModel)
              .set({ nodes: patched.nodes, edges: patched.edges })
              .where(eq(flowVersionModel.id, draft.id))
          }
        },
      },
    ]
  },

  collector: {
    async resolveIds(workspaceId) {
      const rows = await db.query.flowModel.findMany({
        where: { workspaceId },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) {
        return []
      }
      const rows = await db.query.flowModel.findMany({
        where: { workspaceId, id: { in: uniqueIds } },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return {
          entries: [],
          folderIds: [],
          productCategoryIds: [],
          hardDependencies: [],
        }
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
      const entries = (
        await Promise.all(
          rows.map((flow) => buildFlowExportEntry(workspaceId, flow)),
        )
      ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

      const folderIds = rows.flatMap((flow) =>
        flow.folderId ? [flow.folderId] : [],
      )

      // A flow may reference an Account Field (`bot_field:<id>` token) that
      // was never explicitly selected for this template — same save-time
      // "hard dependency" rule `entryPointLinks` uses for its NOT NULL
      // `flowId`, just for a nullable/jsonb soft reference instead of a FK.
      // `botField` rows are provided by the `settings` category (see
      // `settingsAdapter.providesKinds`), so every referenced source id is
      // reported there — `buildTemplateSnapshot` folds this into
      // `idsByCategory.settings` and re-collects it before the payload is
      // assembled, resolving the reference by construction instead of
      // installing with a silently dropped/warned token.
      const botFieldSourceIds = new Set<string>()
      for (const rawEntry of entries) {
        const entry = rawEntry as unknown as TemplateFlowEntry
        const { botFieldIds } = collectFieldReferences({
          nodes: entry.nodes,
          edges: entry.edges,
        })
        for (const sourceId of botFieldIds) {
          botFieldSourceIds.add(sourceId)
        }
      }
      const hardDependencies: TemplateHardDependency[] = [
        ...botFieldSourceIds,
      ].map((sourceId) => ({ category: "settings", sourceId }))

      return {
        entries,
        folderIds,
        productCategoryIds: [],
        hardDependencies,
      }
    },
  } satisfies ResourceCollector,
}

/**
 * Builds one `flows` resource entry in the shape `flowsAdapter.insert`
 * expects, reusing the workspace's *draft* version — falls back from
 * published per the plan's deviation from single-flow export ("blocking a
 * template on one unpublished flow is hostile").
 */
const buildFlowExportEntry = async (
  workspaceId: string,
  flow: {
    id: string
    name: string
    active: boolean
    enableInInbox: boolean
    folderId: string | null
  },
): Promise<(Record<string, unknown> & { sourceId: string }) | undefined> => {
  const published = await flowVersionService.findPublished({
    flowId: flow.id,
    workspaceId,
  })
  const draft = await flowVersionService.findDraft({
    flowId: flow.id,
    workspaceId,
  })
  const version = published ?? draft
  if (!version) {
    return
  }
  return {
    sourceId: flow.id,
    name: flow.name,
    active: flow.active,
    enableInInbox: flow.enableInInbox,
    startNodeId: version.startNodeId,
    nodes: version.nodes as FlowExportedFlow["nodes"],
    edges: version.edges as FlowExportedFlow["edges"],
    folderId: flow.folderId,
  }
}

const resolveFolderReference = (
  ctx: TemplateInstallContext,
  entry: TemplateFlowEntry,
): string | null => {
  if (!entry.folderId || entry.folderId === rootFolderId) {
    return null
  }
  const targetId = ctx.idMaps.folder?.get(entry.folderId)
  if (!targetId) {
    ctx.warn({
      category: "flows",
      entityKind: "folder",
      path: `flows.${entry.sourceId}.folderId`,
      value: entry.folderId,
    })
    return null
  }
  return targetId
}
