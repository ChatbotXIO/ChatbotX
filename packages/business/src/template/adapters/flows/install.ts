import type { TemplateFlowEntry } from "@chatbotx.io/flow-config"
import { flowService } from "../../../flow"
import type { ReferenceExistenceCache } from "../../reference-sanitizer"
import { idMapOf, recordCopy } from "../shared"
import type { PatchTask, TemplateInstallContext } from "../types"
import { createDeferredFlowPatch } from "./deferred-patch"
import { FLOW_INSERT_KINDS } from "./kinds"
import { registerIdentityNodeIds } from "./node-ids"
import {
  checkPublishable,
  prepareFlowGraph,
  resolveFlowFolder,
  warnFlowNotPublished,
} from "./prepare-graph"

/**
 * Inserts the flows through `flowService.createFromImport` verbatim, exactly
 * as single-flow import does, then returns the Phase-2 task that resolves the
 * references between them (a flow may name another that did not exist yet).
 */
export const insertFlows = async (
  ctx: TemplateInstallContext,
  entries: readonly TemplateFlowEntry[],
): Promise<PatchTask[]> => {
  // The map exists even when nothing is inserted: later kinds read it.
  idMapOf(ctx, "flow")
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

    const folderId = resolveFlowFolder(ctx, entry)

    // Live only when the source was live and the installed graph can run:
    // otherwise a draft the installer publishes after fixing it.
    const checked =
      entry.published === true && prepared.resolvedCompletely
        ? await checkPublishable(ctx, graph)
        : { ok: false as const }
    const publishable = checked.ok
    if (!publishable) {
      warnFlowNotPublished(ctx, entry.sourceId)
    }

    const flowId = await flowService.createFromImport({
      workspaceId: ctx.workspaceId,
      name: entry.name,
      active: publishable ? entry.active : false,
      enableInInbox: entry.enableInInbox,
      startNodeId: entry.startNodeId,
      // A publish writes the normalized nodes, as `republish` does.
      nodes: checked.ok ? checked.nodes : graph.nodes,
      edges: graph.edges,
      folderId,
      tx: ctx.tx,
      validatePublishable: false,
      publishedToo: publishable,
    })
    if (publishable) {
      publishedFlowIds.add(flowId)
    }

    sourceIdByFlowId.set(flowId, entry.sourceId)
    registerIdentityNodeIds(ctx, entry)
    insertedFlowIds.push(flowId)
    recordCopy(ctx, {
      category: "flows",
      resourceKind: "flow",
      idMapKind: "flow",
      sourceId: entry.sourceId,
      resourceId: flowId,
    })
  }

  return [
    createDeferredFlowPatch({
      insertedFlowIds,
      sourceIdByFlowId,
      publishedFlowIds,
    }),
  ]
}
