import type { TemplateFlowEntry } from "@chatbotx.io/flow-config"
import { idMapOf } from "../shared"
import type { TemplateInstallContext } from "../types"

/**
 * `createFromImport` reuses node ids verbatim (safe because every
 * nodeId-keyed table also scopes by the freshly-minted flowId), so the
 * `flowNode` id map is the identity map for every node of an installed flow.
 * Without it the deferred patch pass warned for every cross-flow node jump.
 */
export const registerIdentityNodeIds = (
  ctx: TemplateInstallContext,
  entry: TemplateFlowEntry,
): void => {
  const nodeIdMap = idMapOf(ctx, "flowNode")
  for (const node of entry.nodes) {
    nodeIdMap.set(node.id, node.id)
  }
}

/** Registers the node ids of every installed flow copy the maps know, whether or not this run touches it. */
export const registerInstalledCopyNodeIds = async (
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
  const nodeIdMap = idMapOf(ctx, "flowNode")
  for (const version of versions) {
    for (const node of version.nodes) {
      nodeIdMap.set(node.id, node.id)
    }
  }
}
