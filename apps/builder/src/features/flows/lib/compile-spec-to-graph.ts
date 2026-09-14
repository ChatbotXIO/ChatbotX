import { getFlowAuthoringContext } from "@chatbotx.io/business/capabilities"
import {
  compileFlowSpec,
  type EdgeSchema,
  FlowAuthoringException,
  type FlowSpec,
  type FlowVersionSchema,
  formatZodPathSegment,
  zodErrorToFlowAuthoringErrors,
} from "@chatbotx.io/flow-config"
import { publishFlowSchema } from "../schema/action"

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

/**
 * Translates a `publishFlowSchema` issue path — `["nodes", nodeIndex,
 * ...rest]`, since `refineStepsByChannel` re-anchors onto the node it found
 * the problem in (`channel-step-refinement.ts`) — back to the spec-relative
 * path (e.g. `steps[2].buttons[0].then[0]`) the caller actually wrote, via
 * the node id `compileFlowSpec` recorded it under. `undefined` (never the
 * bare zod path) when the issue doesn't have that shape, so a genuinely
 * unexpected issue still surfaces instead of silently mislabeling it.
 */
function mapPublishIssuePath(
  issuePath: PropertyKey[],
  nodes: readonly FlowVersionSchema[],
  specPathByNodeId: ReadonlyMap<string, string>,
): string | undefined {
  const [field, nodeIndex, ...rest] = issuePath
  if (field !== "nodes" || typeof nodeIndex !== "number") {
    return
  }
  const nodeId = nodes[nodeIndex]?.id
  const specPath = nodeId ? specPathByNodeId.get(nodeId) : undefined
  if (!specPath) {
    return
  }
  return rest.reduce(formatZodPathSegment, specPath)
}

/**
 * `flows.publish`/`flows.validate`'s `{ spec }` path: compiles the spec, then
 * validates the result exactly like a raw `{ nodes, edges }` publish would
 * (`publishFlowSchema`, which runs channel rules `compileFlowSpec` itself
 * never runs). A validation failure here is remapped onto the spec-relative
 * path the agent wrote and thrown as `FlowAuthoringException` — the single
 * error contract every flow-authoring failure uses — instead of a raw
 * `ZodError` pointing at compiled-node internals.
 */
export async function compileAndValidateSpec(
  spec: FlowSpec,
  workspaceId: string,
): Promise<{ nodes: FlowVersionSchema[]; edges: EdgeSchema[] }> {
  const ctx = await getFlowAuthoringContext(workspaceId)
  const { nodes, edges, specPathByNodeId } = compileFlowSpec(spec, ctx)

  const result = publishFlowSchema.safeParse({ nodes, edges })
  if (!result.success) {
    throw new FlowAuthoringException(
      zodErrorToFlowAuthoringErrors(result.error, "invalidStep", (issuePath) =>
        mapPublishIssuePath(issuePath, nodes, specPathByNodeId),
      ),
    )
  }

  return result.data
}
