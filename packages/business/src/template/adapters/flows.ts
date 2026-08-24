import { eq } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { flowVersionModel } from "@chatbotx.io/database/schema"
import type { TemplateFlowEntry } from "@chatbotx.io/flow-config"
import { remapFlowGraphReferences } from "@chatbotx.io/flow-config"
import { flowService } from "../../flow"
import { flowVersionService } from "../../flow-version"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

const FLOW_INSERT_KINDS = [
  "customField",
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
