import {
  ButtonType,
  type StartAnotherNodeStepSchema,
  type StepProps,
  type StepsProps,
  startAnotherNodeStepDefaultFn,
} from "@aha.chat/flow-config"
import {
  type Connection,
  type Edge,
  type Node,
  useReactFlow,
} from "@xyflow/react"
import { useCallback } from "react"

const updateStepOnEdgeDelete = (
  step: StepProps,
  edgesToDelete: Edge | null,
): StepProps => {
  const hasButtons = "buttons" in step && Array.isArray(step.buttons)
  if (hasButtons) {
    step.buttons.map((button) => {
      if (
        (button.beforeStep as StartAnotherNodeStepSchema)?.nodeId ===
        edgesToDelete?.target
      ) {
        button.beforeStep = null
        button.buttonType = null
      }
      return button
    })
  }

  return step
}

const updateStepOnEdgeConnect = (
  step: StepProps,
  connection: Connection,
): StepProps => {
  const hasButtons = "buttons" in step && Array.isArray(step.buttons)
  if (hasButtons) {
    step.buttons.map((button) => {
      if (button.id === connection.sourceHandle) {
        button.beforeStep = startAnotherNodeStepDefaultFn({
          nodeId: connection.target,
          viewOnly: true,
        })
        button.buttonType = ButtonType.SendMessage
      }
      return button
    })
  }

  return step
}

export function useCustomFlow() {
  const { getNode, getEdge, updateNodeData, setEdges } = useReactFlow()

  const getNodeOnEdgeDelete = useCallback(
    ({ node, edgesToDelete }: { node: Node; edgesToDelete: Edge | null }) => ({
      ...node,
      data: {
        ...node.data,
        steps: (node.data.steps as StepsProps).map((step) =>
          updateStepOnEdgeDelete(step, edgesToDelete),
        ),
      },
    }),
    [],
  )

  const getNodeOnEdgeConnect = useCallback(
    ({
      connection,
      sourceNode,
    }: {
      connection: Connection
      sourceNode: Node
    }) => ({
      ...sourceNode,
      data: {
        ...sourceNode.data,
        steps: (sourceNode.data.steps as StepsProps).map((step) =>
          updateStepOnEdgeConnect(step, connection),
        ),
      },
    }),
    [],
  )

  const updateNodeDataOnEdgeDelete = useCallback(
    (edgeId: string) => {
      const edgesToDelete = getEdge(edgeId)
      const sourceNode = getNode(edgesToDelete?.source || "")
      if (sourceNode && edgesToDelete) {
        updateNodeData(
          sourceNode.id,
          getNodeOnEdgeDelete({
            node: sourceNode,
            edgesToDelete,
          }),
        )
      }
      setEdges((items) => items.filter((e) => e.id !== edgeId))
    },
    [setEdges, getNode, getEdge, updateNodeData, getNodeOnEdgeDelete],
  )

  const updateNodeDataOnEdgeConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = getNode(connection.source)
      if (sourceNode) {
        updateNodeData(
          sourceNode.id,
          getNodeOnEdgeConnect({
            connection,
            sourceNode,
          }),
        )
      }
    },
    [getNode, updateNodeData, getNodeOnEdgeConnect],
  )

  return {
    updateNodeDataOnEdgeConnect,
    updateNodeDataOnEdgeDelete,
  }
}
