import { isBotFieldReference } from "../field-reference"
import { ReplyFormat } from "./get-user-data"

type LocationGraphStep = {
  id: string
  stepType: string
  replyFormat?: string
  outputFieldId?: string
}

export type LocationGraphNode = {
  id: string
  data?: {
    details?: {
      // Buttons, cards and quick replies carry their own nested `steps`.
      [key: string]: unknown
      steps?: readonly LocationGraphStep[]
    }
  }
}

/** Loose on purpose: stored flow-version edges type their ends as `unknown`. */
export type LocationGraphEdge = {
  [key: string]: unknown
  source?: unknown
  target?: unknown
}

/** True when `value` holds a step with `stepId` at any depth. */
const containsStep = (value: unknown, stepId: string): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => containsStep(item, stepId))
  }
  if (value && typeof value === "object") {
    if ("stepType" in value && "id" in value && value.id === stepId) {
      return true
    }
    return Object.values(value).some((item) => containsStep(item, stepId))
  }
  return false
}

/**
 * The node running `stepId` and how many of its top-level steps run before
 * it. A step nested in a button, card or quick reply runs after the step
 * that carries it (or, for quick replies, after every step of the node).
 */
const findStartNode = (
  nodes: readonly LocationGraphNode[],
  stepId: string,
): { node: LocationGraphNode; stepsBefore: number } | null => {
  for (const node of nodes) {
    const details = node.data?.details
    if (!containsStep(details, stepId)) {
      continue
    }
    const steps = details?.steps ?? []
    const index = steps.findIndex((step) => step.id === stepId)
    if (index >= 0) {
      return { node, stepsBefore: index }
    }
    const carrier = steps.findIndex((step) => containsStep(step, stepId))
    return { node, stepsBefore: carrier >= 0 ? carrier + 1 : steps.length }
  }
  return null
}

const isLocationSource = (
  step: LocationGraphStep,
): step is LocationGraphStep & {
  outputFieldId: string
} =>
  step.stepType === "getUserData" &&
  step.replyFormat === ReplyFormat.location &&
  Boolean(step.outputFieldId) &&
  !isBotFieldReference(step.outputFieldId ?? "")

/**
 * Collects the contact custom fields that upstream Get User Data (Location)
 * steps write to: earlier steps of the node holding `stepId`, then every node
 * reached by walking the graph backwards from it. Bot fields are ignored.
 * Shared by the worker (on the executed flow version) and the builder editor
 * warning.
 */
export function findUpstreamLocationFieldKeys(input: {
  nodes: readonly LocationGraphNode[]
  edges: readonly LocationGraphEdge[]
  stepId: string
}): string[] {
  const { nodes, edges, stepId } = input
  const start = findStartNode(nodes, stepId)
  if (!start) {
    return []
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const sourcesByTarget = new Map<string, string[]>()
  for (const { source, target } of edges) {
    if (typeof source !== "string" || typeof target !== "string") {
      continue
    }
    const sources = sourcesByTarget.get(target) ?? []
    sources.push(source)
    sourcesByTarget.set(target, sources)
  }

  const keys = new Set<string>()
  const collect = (steps: readonly LocationGraphStep[]) => {
    for (const step of steps) {
      if (isLocationSource(step)) {
        keys.add(step.outputFieldId)
      }
    }
  }

  collect((start.node.data?.details?.steps ?? []).slice(0, start.stepsBefore))

  // The start node is not marked visited: reached again through a cycle, all
  // of its steps have run before the action.
  const visited = new Set<string>()
  const queue = [...(sourcesByTarget.get(start.node.id) ?? [])]
  while (queue.length > 0) {
    const nodeId = queue.shift() as string
    if (visited.has(nodeId)) {
      continue
    }
    visited.add(nodeId)
    collect(nodesById.get(nodeId)?.data?.details?.steps ?? [])
    queue.push(...(sourcesByTarget.get(nodeId) ?? []))
  }

  return [...keys]
}
