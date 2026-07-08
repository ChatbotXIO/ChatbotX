import type { FlowNode } from "@chatbotx.io/flow-config"
import type { Edge, Node } from "@xyflow/react"

const normalizeNodeForSave = (node: FlowNode) => {
  const {
    selected: _selected,
    dragging: _dragging,
    width: _width,
    height: _height,
    data,
    ...rest
  } = node as FlowNode & {
    dragging?: boolean
    height?: number
    width?: number
  }
  const { forceToolbarVisible: _forceToolbarVisible, ...restData } = {
    ...((data ?? {}) as Record<string, unknown>),
  }

  return {
    ...rest,
    data: restData as FlowNode["data"],
  }
}

const normalizeEdgeForSave = (edge: Edge) => ({
  id: edge.id,
  source: edge.source,
  sourceHandle: edge.sourceHandle,
  target: edge.target,
  targetHandle: edge.targetHandle,
})

export const serializeFlowContent = (
  nodes: ReadonlyArray<FlowNode | Node | Record<string, unknown>>,
  edges: ReadonlyArray<Edge | Record<string, unknown>>,
) =>
  JSON.stringify({
    nodes: nodes.map((node) =>
      normalizeNodeForSave(node as unknown as FlowNode),
    ),
    edges: edges.map((edge) => normalizeEdgeForSave(edge as Edge)),
  })

export const isSameContent = (
  aNodes: ReadonlyArray<FlowNode | Node | Record<string, unknown>>,
  aEdges: ReadonlyArray<Edge | Record<string, unknown>>,
  bNodes: ReadonlyArray<FlowNode | Node | Record<string, unknown>>,
  bEdges: ReadonlyArray<Edge | Record<string, unknown>>,
) =>
  serializeFlowContent(aNodes, aEdges) === serializeFlowContent(bNodes, bEdges)
