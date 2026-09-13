import { getFlowAuthoringContext } from "@chatbotx.io/business/capabilities"
import {
  compileFlowSpec,
  type EdgeSchema,
  type FlowSpec,
  type FlowVersionSchema,
} from "@chatbotx.io/flow-config"

/**
 * Resolves a `{ spec }` flow-authoring request into the raw `{ nodes, edges }`
 * graph shape `flowVersionService` persists — the single place
 * `flows.publish`/`flows.updateDraft`/`flows.validate` all go through so the
 * capabilities lookup and compiler call never drift between them.
 */
export async function compileSpecToGraph(
  spec: FlowSpec,
  workspaceId: string,
): Promise<{ nodes: FlowVersionSchema[]; edges: EdgeSchema[] }> {
  const ctx = await getFlowAuthoringContext(workspaceId)
  const { nodes, edges } = compileFlowSpec(spec, ctx)
  return { nodes, edges }
}
