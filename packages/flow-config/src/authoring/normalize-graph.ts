import { createId } from "@chatbotx.io/utils"
import { DEFAULT_NODE_MEASURED } from "../nodes/base"
import type { EdgeSchema } from "../nodes/index"
import { FlowAuthoringException } from "./errors"
import { type LayoutPosition, layoutNodes } from "./layout"

export type AuthoredNodeInput = {
  id: string
  position?: LayoutPosition
  measured?: { width: number; height: number }
  data?: { isStartNode?: boolean }
}

export type AuthoredEdgeInput = {
  id?: string
  source: string
  sourceHandle?: string
  target: string
  targetHandle?: string
}

export type NormalizedAuthoredGraph<T> = {
  nodes: T[]
  edges: EdgeSchema[]
  startNodeId: string
}

/**
 * Normalizes a caller-authored `{ nodes, edges }` graph into the shape the
 * builder canvas and `flowVersionModel` expect: every node's id is remapped
 * to a fresh internal `createId()` id (the caller's id is only a
 * request-scoped token for wiring `edges`, since node ids elsewhere in this
 * codebase are numeric snowflakes — see `zodBigintAsString`), every node
 * gets a `position` (a caller-supplied one always wins; otherwise it's laid
 * out with the same `layoutNodes` BFS the spec compiler uses) and a
 * `measured` footprint, and every edge gets an `id` and handles remapped to
 * the new node ids, using the same node-id-as-handle convention
 * `addHandleEdge`/`addContinueEdge` use for a "Continue" edge
 * (`./compile.ts`). Exactly one node ends up with `data.isStartNode: true`.
 *
 * Collects every problem before throwing, mirroring `compileFlowSpec`'s
 * all-errors-at-once contract so a caller sees every issue in one 422.
 */
export function normalizeAuthoredGraph<T extends AuthoredNodeInput>(
  nodes: readonly T[],
  edges: readonly AuthoredEdgeInput[],
): NormalizedAuthoredGraph<T> {
  const errors: {
    path: string
    code: "invalidGraph"
    message: string
  }[] = []

  if (nodes.length === 0) {
    errors.push({
      path: "nodes",
      code: "invalidGraph",
      message: "A flow needs at least one node.",
    })
  }

  const nodeIds = new Set<string>()
  for (const [index, node] of nodes.entries()) {
    if (nodeIds.has(node.id)) {
      errors.push({
        path: `nodes[${index}].id`,
        code: "invalidGraph",
        message: `Duplicate node id "${node.id}".`,
      })
      continue
    }
    nodeIds.add(node.id)
  }

  for (const [index, edge] of edges.entries()) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        path: `edges[${index}].source`,
        code: "invalidGraph",
        message: `Edge source "${edge.source}" does not match any node id.`,
      })
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        path: `edges[${index}].target`,
        code: "invalidGraph",
        message: `Edge target "${edge.target}" does not match any node id.`,
      })
    }
  }

  if (errors.length > 0) {
    throw new FlowAuthoringException(errors)
  }

  // A caller-authored id is just a request-scoped token for wiring `edges`
  // together; it is never persisted as the node's actual id. Every real
  // node id in this codebase is a `createId()` snowflake (`baseNodeSchema.id`
  // / `zodBigintAsString` requires digits only), and `publishFlowSchema`
  // enforces that pattern — an arbitrary caller string like "n1" would
  // otherwise 422 the moment `publish: true` validates the graph. Remapping
  // unconditionally (not only on the publish path) keeps the persisted
  // shape identical whether or not the caller also asked to publish.
  const idByAuthoredId = new Map(
    nodes.map((node) => [node.id, createId()] as const),
  )
  const internalId = (authoredId: string): string => {
    const mapped = idByAuthoredId.get(authoredId)
    if (!mapped) {
      throw new Error(`Unmapped authored node id "${authoredId}".`)
    }
    return mapped
  }

  const startNodeAuthoredId =
    nodes.find((node) => node.data?.isStartNode === true)?.id ?? nodes[0].id
  const startNodeId = internalId(startNodeAuthoredId)

  const positions = layoutNodes(
    nodes.map((node) => node.id),
    edges,
    startNodeAuthoredId,
  )

  const resolvedNodes = nodes.map((node) => {
    const id = internalId(node.id)
    return {
      ...node,
      id,
      position: node.position ?? positions.get(node.id),
      measured: node.measured ?? DEFAULT_NODE_MEASURED,
      data: { ...node.data, isStartNode: id === startNodeId },
    }
  }) as T[]

  const resolvedEdges: EdgeSchema[] = edges.map((edge) => {
    const source = internalId(edge.source)
    const target = internalId(edge.target)
    return {
      id: edge.id ?? createId(),
      source,
      // A caller-supplied handle is an arbitrary handle name (e.g. a
      // quick-reply button's handle), not a node id — leave it untouched.
      // The default is the node-id-as-handle "Continue" convention, so it
      // must track the remapped id, not the authored one.
      sourceHandle: edge.sourceHandle ?? source,
      target,
      targetHandle: edge.targetHandle ?? target,
    }
  })

  return { nodes: resolvedNodes, edges: resolvedEdges, startNodeId }
}
