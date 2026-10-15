import {
  evaluateExpression,
  isTruthy,
  type MiniAppRuntimeScope,
} from "../expression"
import type { MiniAppNode } from "../types"

/** Whether a node's `visible` expression (absent = visible) holds for the answers so far. */
export const isNodeVisible = (
  node: MiniAppNode,
  scope: MiniAppRuntimeScope,
): boolean => {
  const visible = node.props.visible
  if (visible === undefined) {
    return true
  }
  return isTruthy(evaluateExpression(visible as string | boolean, scope))
}

/**
 * The nodes a visitor actually sees, in order: hidden nodes dropped, each If
 * replaced by its `then` or `else` branch, each Switch by the case its value
 * names, and each Form by its children.
 */
export const resolveRenderedNodes = (
  nodes: readonly MiniAppNode[],
  scope: MiniAppRuntimeScope,
): MiniAppNode[] =>
  nodes.flatMap((node) => {
    if (!isNodeVisible(node, scope)) {
      return []
    }
    switch (node.type) {
      case "If": {
        const condition = node.props.condition as string | boolean
        const branch = isTruthy(evaluateExpression(condition, scope))
          ? "then"
          : "else"
        return resolveRenderedNodes(node.slots?.[branch] ?? [], scope)
      }
      case "Switch": {
        const value = evaluateExpression(String(node.props.value ?? ""), scope)
        return resolveRenderedNodes(
          node.slots?.[String(value ?? "")] ?? [],
          scope,
        )
      }
      case "Form":
        return resolveRenderedNodes(node.slots?.children ?? [], scope)
      default:
        return [node]
    }
  })
