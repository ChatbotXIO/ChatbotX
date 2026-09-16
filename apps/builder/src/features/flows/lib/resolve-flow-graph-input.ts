import {
  type AuthoredEdgeInput,
  type AuthoredNodeInput,
  type EdgeSchema,
  FlowAuthoringException,
  type FlowSpec,
  type FlowVersionSchema,
  normalizeAuthoredGraph,
  zodErrorToFlowAuthoringErrors,
} from "@chatbotx.io/flow-config"
import { publishFlowSchema } from "../schema/action"
import {
  compileAndValidateSpec,
  compileSpecToGraph,
} from "./compile-spec-to-graph"

export type FlowGraphInput = {
  spec?: FlowSpec
  nodes?: AuthoredNodeInput[]
  edges?: AuthoredEdgeInput[]
}

export type ResolvedFlowGraph = {
  nodes: FlowVersionSchema[]
  edges: EdgeSchema[]
  startNodeId: string
}

/**
 * Resolves one of `flows.create`'s two mutually exclusive content shapes
 * (`{ spec }` or raw `{ nodes, edges }`) into the graph `flowService.createDraft`
 * persists. `undefined` when the request carried no content, so the caller
 * keeps today's default-start-node draft behavior.
 *
 * `options.validate` mirrors the `flows.publish` vs `flows.updateDraft`
 * split: `true` runs the same `publishFlowSchema` check `flows.publish` runs
 * (used when the caller also passed `publish: true`); `false` skips it,
 * since draft nodes are not otherwise schema-validated.
 */
export function resolveFlowGraphInput(
  input: FlowGraphInput,
  workspaceId: string,
  options: { validate: boolean },
): Promise<ResolvedFlowGraph | undefined> {
  if (input.spec) {
    return options.validate
      ? compileAndValidateSpec(input.spec, workspaceId)
      : compileSpecToGraph(input.spec, workspaceId)
  }

  if (!input.nodes) {
    return Promise.resolve(undefined)
  }

  const graph = normalizeAuthoredGraph(input.nodes, input.edges ?? [])

  if (!options.validate) {
    // Draft nodes are unvalidated by design, same as `flows.updateDraft`'s
    // raw `{ nodes, edges }` path — `authorableNodeSchema` only requires an
    // `id`, so the graph is not `FlowVersionSchema`-shaped until publish time.
    return Promise.resolve(graph as unknown as ResolvedFlowGraph)
  }

  const result = publishFlowSchema.safeParse({
    nodes: graph.nodes,
    edges: graph.edges,
  })
  if (!result.success) {
    // No spec-path remapper here (unlike `compileAndValidateSpec`): the
    // caller wrote these node paths directly, so the raw zod path is already
    // the path they need to fix.
    throw new FlowAuthoringException(
      zodErrorToFlowAuthoringErrors(result.error, "invalidStep"),
    )
  }

  return Promise.resolve({ ...result.data, startNodeId: graph.startNodeId })
}
