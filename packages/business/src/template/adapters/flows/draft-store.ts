import { and, type DatabaseClient, eq } from "@chatbotx.io/database/client"
import { flowModel, flowVersionModel } from "@chatbotx.io/database/schema"
import type {
  FlowExportedFlow,
  TemplateFlowEntry,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { TemplateInstallContext } from "../types"
import { checkPublishable, warnFlowNotPublished } from "./prepare-graph"

export type FlowDraftContent = {
  name: string
  startNodeId: string
  nodes: unknown[]
  edges: unknown[]
}

const isDraftOf = (flowId: string) =>
  and(eq(flowVersionModel.flowId, flowId), eq(flowVersionModel.isDraft, true))

/**
 * Takes a just-inserted live flow back to a draft: no current version, not
 * active, and the published copy removed (nothing else references a version
 * created in this same transaction).
 */
export const demoteToDraft = async (
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
export const readDraft = async (tx: DatabaseClient, flowId: string) => {
  const [draft] = await tx
    .select()
    .from(flowVersionModel)
    .where(isDraftOf(flowId))
    .for("update")
    .limit(1)
  return draft
}

/** Writes the draft; returns whether the flow also has a published version. */
export const writeDraft = async (
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
    .where(isDraftOf(flowId))
  return Boolean(flow?.currentVersionId)
}

/**
 * A flow that was live stays live on the new content: the updated graph is
 * published as a new version when it is publishable, and otherwise the old
 * published version keeps running with a warning. Published versions are
 * immutable, so this adds one rather than editing the current.
 */
export const republish = async (
  ctx: TemplateInstallContext,
  entry: TemplateFlowEntry,
  flowId: string,
  graph: Pick<FlowDraftContent, "nodes" | "edges">,
): Promise<void> => {
  const check = await checkPublishable(ctx, graph)
  if (!check.ok) {
    warnFlowNotPublished(ctx, entry.sourceId)
    return
  }
  const { nodes } = check
  const versionId = createId()
  // Like a manual publish, the draft keeps the normalized graph too.
  await ctx.tx.update(flowVersionModel).set({ nodes }).where(isDraftOf(flowId))
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
