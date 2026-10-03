"use client"

import {
  type ButtonType,
  buttonTypes,
  type FlowNode,
  nodeTypeSchema,
  type OpenWebsiteStepSchema,
  openWebsiteStepDefaultFn,
  performActionNodeDefaultFn,
  type StartAnotherNodeStepSchema,
  type StartExternalFlowStepSchema,
  type StartExternalNodeStepSchema,
  sendMessageNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
  startExternalFlowStepDefaultFn,
  startExternalNodeStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { useReactFlow } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { useCallback } from "react"

export type ButtonTargetBeforeStep =
  | StartAnotherNodeStepSchema
  | OpenWebsiteStepSchema
  | StartExternalFlowStepSchema
  | StartExternalNodeStepSchema

export function useHandleEdges() {
  const { setEdges } = useReactFlow()

  const refreshEdge = useCallback(
    (handleId: string, sourceNodeId: string, targetNodeId: string) => {
      setEdges((currentEdges) => [
        ...currentEdges.filter((edge) => edge.sourceHandle !== handleId),
        {
          id: handleId,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle: handleId,
          targetHandle: targetNodeId,
          type: "buttonedge",
        },
      ])
    },
    [setEdges],
  )

  const removeEdge = useCallback(
    (handleId: string) => {
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => edge.sourceHandle !== handleId),
      )
    },
    [setEdges],
  )

  return { refreshEdge, removeEdge }
}

/**
 * Builds the beforeStep for a chosen button type; for Send Message and
 * Perform Action it also creates and adds the new node.
 */
export function useCreateButtonTarget() {
  const t = useTranslations()
  const { getNodes, addNodes, screenToFlowPosition } = useReactFlow()

  return useCallback(
    (
      buttonType: ButtonType,
    ): {
      beforeStep: ButtonTargetBeforeStep
      newNode: FlowNode | null
    } | null => {
      const allNodes = getNodes() as FlowNode[]
      const position = screenToFlowPosition({
        x: window.innerWidth - 400,
        y: 100,
      })

      let newNode: FlowNode | null = null
      let beforeStep: ButtonTargetBeforeStep | null = null

      switch (buttonType) {
        case buttonTypes.enum.sendMessage: {
          const nodeCount = allNodes.filter(
            (node) => node.type === nodeTypeSchema.enum.sendMessage,
          ).length
          newNode = sendMessageNodeDefaultFn({
            nodeProps: { position },
            dataProps: {
              name: `${t("actions.sendMessage")} #${nodeCount + 1}`,
            },
          })
          beforeStep = startAnotherNodeStepDefaultFn({
            nodeId: newNode.id,
            viewOnly: true,
          })
          break
        }
        case buttonTypes.enum.performAction: {
          const nodeCount = allNodes.filter(
            (node) => node.type === nodeTypeSchema.enum.performAction,
          ).length
          newNode = performActionNodeDefaultFn({
            nodeProps: { position },
            dataProps: {
              name: `${t("flows.actions.performAction")} #${nodeCount + 1}`,
            },
          })
          beforeStep = startAnotherNodeStepDefaultFn({
            nodeId: newNode.id,
            viewOnly: true,
          })
          break
        }
        case buttonTypes.enum.startExternalFlow:
          beforeStep = startExternalFlowStepDefaultFn()
          break
        case buttonTypes.enum.openWebsite:
          beforeStep = openWebsiteStepDefaultFn()
          break
        case buttonTypes.enum.startExternalNode:
          beforeStep = startExternalNodeStepDefaultFn()
          break
        case buttonTypes.enum.startAnotherNode:
          beforeStep = startAnotherNodeStepDefaultFn()
          break
        default:
          return null
      }

      if (newNode) {
        addNodes([newNode])
      }
      return { beforeStep, newNode }
    },
    [addNodes, getNodes, screenToFlowPosition, t],
  )
}
