import { eq } from "@chatbotx.io/database/client"
import { flowVersionModel } from "@chatbotx.io/database/schema"
import {
  remapFlowGraphReferences,
  type UnresolvedReference,
} from "@chatbotx.io/flow-config"
import { flowVersionService } from "../../../flow-version"
import { sanitizeFlowGraphReferences } from "../../reference-sanitizer"
import { notYetReported } from "../shared"
import type { PatchTask, TemplateInstallContext } from "../types"
import { demoteToDraft } from "./draft-store"
import { FLOW_DEFERRED_KINDS } from "./kinds"
import { warnFlowNotPublished } from "./prepare-graph"

/** What the insert pass learned about the flows the patch pass finishes. */
export type DeferredFlowPatchState = {
  insertedFlowIds: readonly string[]
  sourceIdByFlowId: ReadonlyMap<string, string>
  /** Flows inserted live; the patch decides whether they stay live. */
  publishedFlowIds: ReadonlySet<string>
}

type FlowDraft = NonNullable<
  Awaited<ReturnType<typeof flowVersionService.findDraft>>
>

/**
 * Remaps the draft's deferred references (flow, node, trigger) and warns for
 * each one that did not make it. Every flow of the template exists by now, so
 * a flow, node or trigger id still unresolved names something the template
 * does not carry: it is removed rather than left at the source's id.
 * Returns how many warnings the flow raised.
 */
const remapDeferredReferences = async (
  ctx: TemplateInstallContext,
  draft: FlowDraft,
  sourceId: string,
) => {
  const unresolved: UnresolvedReference[] = []
  const remapped = remapFlowGraphReferences(
    { nodes: draft.nodes, edges: draft.edges },
    ctx.idMaps,
    {
      kinds: FLOW_DEFERRED_KINDS,
      onUnresolved: (ref) => unresolved.push(ref),
    },
  )
  const sanitized = await sanitizeFlowGraphReferences({
    workspaceId: ctx.workspaceId,
    graph: remapped,
    unresolved,
    tx: ctx.tx,
    removeKinds: new Set(FLOW_DEFERRED_KINDS),
  })
  const reported = [
    ...sanitized.removed,
    ...sanitized.droppedElements,
    ...sanitized.blocked,
  ]
  // Warnings are keyed by the source id, like the same warning at insert.
  const pending = notYetReported(unresolved, reported)
  for (const ref of pending) {
    ctx.warn({
      category: "flows",
      entityKind: ref.entityKind,
      path: `flows.${sourceId}.${ref.path}`,
      value: ref.value,
    })
  }
  for (const path of reported) {
    ctx.warn({
      category: "flows",
      entityKind: "referenceRemoved",
      path: `flows.${sourceId}.${path}`,
      value: sourceId,
    })
  }
  return { graph: sanitized.value, warnings: pending.length + reported.length }
}

/**
 * Finishes one inserted flow once every flow of the install exists. A flow
 * whose patch had to warn (an unresolved or removed reference) must not run
 * live with a graph that was changed, so it is kept as a draft, like one that
 * never could be published.
 */
const patchOneFlow = async (
  ctx: TemplateInstallContext,
  flowId: string,
  state: DeferredFlowPatchState,
): Promise<void> => {
  const draft = await flowVersionService.findDraft(
    { flowId, workspaceId: ctx.workspaceId },
    ctx.tx,
  )
  if (!draft) {
    return
  }
  const sourceId = state.sourceIdByFlowId.get(flowId) ?? flowId
  const { graph, warnings } = await remapDeferredReferences(
    ctx,
    draft,
    sourceId,
  )
  const wasLive = state.publishedFlowIds.has(flowId)
  const goesLive = wasLive && warnings === 0
  if (wasLive && !goesLive) {
    await demoteToDraft(ctx.tx, flowId)
    warnFlowNotPublished(ctx, sourceId)
  }
  // The published copy carries the same deferred references, so it is
  // patched with the draft rather than left pointing at source ids.
  await ctx.tx
    .update(flowVersionModel)
    .set({ nodes: graph.nodes, edges: graph.edges })
    .where(
      goesLive
        ? eq(flowVersionModel.flowId, flowId)
        : eq(flowVersionModel.id, draft.id),
    )
  // A flow installed live is published: report it, so the caller runs the
  // same after-publish effects as for a manual publish once the transaction
  // has committed.
  if (ctx.publishedFlows && goesLive) {
    const live = await ctx.tx.query.flowModel.findFirst({
      where: { id: flowId },
      columns: { currentVersionId: true },
    })
    if (live?.currentVersionId) {
      ctx.publishedFlows.push({ flowId, versionId: live.currentVersionId })
    }
  }
}

/** The Phase-2 task that resolves flow, node and trigger references between the inserted flows. */
export const createDeferredFlowPatch = (
  state: DeferredFlowPatchState,
): PatchTask => ({
  category: "flows",
  apply: async (ctx) => {
    for (const flowId of state.insertedFlowIds) {
      await patchOneFlow(ctx, flowId, state)
    }
  },
})
