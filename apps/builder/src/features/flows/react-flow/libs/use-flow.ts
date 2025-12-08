import {
  type ButtonType,
  ignoreToDelete,
  type StartAnotherNodeStepSchema,
  type StepProps,
  type StepsProps,
} from "@aha.chat/flow-config"
import type { Edge, Node } from "@xyflow/react"

const updateButtonsOnEdgeDelete = (
  step: StepProps,
  edgesToDelete: Edge | null,
): StepProps => {
  const hasButtons = "buttons" in step && Array.isArray(step.buttons)
  if (hasButtons) {
    step.buttons.map((button) => {
      if (
        !ignoreToDelete.includes(button.buttonType as ButtonType) &&
        (button.beforeStep as StartAnotherNodeStepSchema).nodeId ===
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

export function useCustomFlow() {
  const getNodeOnEdgeDelete = ({
    node,
    edgesToDelete,
  }: {
    node: Node
    edgesToDelete: Edge | null
  }) => {
    console.log(node, edgesToDelete)
    return {
      ...node,
      data: {
        ...node.data,
        steps: (node.data.steps as StepsProps).map((step) => {
          const hasButtons = "buttons" in step && Array.isArray(step.buttons)
          if (hasButtons) {
            return {
              ...step,
              buttons: updateButtonsOnEdgeDelete(step, edgesToDelete),
            }
          }
          return step
        }),
      },
    }
  }

  return {
    getNodeOnEdgeDelete,
  }
}
