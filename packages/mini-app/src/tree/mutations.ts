import type { MiniAppDefinition, MiniAppNode } from "../types"
import { cloneNodeWithNewIds } from "./factory"
import { collectAllNames } from "./names"
import {
  findNode,
  getSlotNodes,
  isDescendantOf,
  type MiniAppSlotAddress,
} from "./walk"

/**
 * Immutable edits: each returns a new definition, or the same one when the
 * target does not exist.
 */

export const insertNode = (
  definition: MiniAppDefinition,
  address: MiniAppSlotAddress,
  index: number,
  node: MiniAppNode,
): MiniAppDefinition => {
  const next = structuredClone(definition)
  const nodes = getSlotNodes(next, address)
  if (!nodes) {
    return definition
  }
  nodes.splice(Math.max(0, Math.min(index, nodes.length)), 0, node)
  return next
}

export const removeNode = (
  definition: MiniAppDefinition,
  nodeId: string,
): MiniAppDefinition => {
  const next = structuredClone(definition)
  const location = findNode(next, nodeId)
  if (!location) {
    return definition
  }
  getSlotNodes(next, location.address)?.splice(location.index, 1)
  return next
}

/** Applies `edit` to a copy of the node; returns the definition unchanged when the node does not exist. */
const editNode = (
  definition: MiniAppDefinition,
  nodeId: string,
  edit: (node: MiniAppNode) => void,
): MiniAppDefinition => {
  const next = structuredClone(definition)
  const location = findNode(next, nodeId)
  if (!location) {
    return definition
  }
  edit(location.node)
  return next
}

export const updateNodeProps = (
  definition: MiniAppDefinition,
  nodeId: string,
  props: Record<string, unknown>,
): MiniAppDefinition =>
  editNode(definition, nodeId, (node) => {
    node.props = props
  })

/** Links a node to a contact custom field; `null` unlinks it. */
export const setNodeCustomField = (
  node: MiniAppNode,
  customFieldId: string | null | undefined,
) => {
  node.customFieldId = customFieldId || undefined
}

export const updateNodeCustomField = (
  definition: MiniAppDefinition,
  nodeId: string,
  customFieldId: string | null,
): MiniAppDefinition =>
  editNode(definition, nodeId, (node) =>
    setNodeCustomField(node, customFieldId),
  )

/** Replaces a container's slots; the entry order becomes the stored order. */
export const updateNodeSlots = (
  definition: MiniAppDefinition,
  nodeId: string,
  entries: [slot: string, children: MiniAppNode[]][],
): MiniAppDefinition =>
  editNode(definition, nodeId, (node) => {
    node.slots = Object.fromEntries(entries)
    node.slotOrder = entries.map(([slot]) => slot)
  })

/**
 * Moves a node to `index` within `target`. `index` is measured against the
 * target list *before* the node is removed, which is what a drag-and-drop
 * "drop before item N" yields. Moving a container into itself is a no-op.
 */
export const moveNode = (
  definition: MiniAppDefinition,
  nodeId: string,
  target: MiniAppSlotAddress,
  index: number,
): MiniAppDefinition => {
  if (
    target.parentId &&
    (target.parentId === nodeId ||
      isDescendantOf(definition, nodeId, target.parentId))
  ) {
    return definition
  }
  const next = structuredClone(definition)
  const location = findNode(next, nodeId)
  const source = location && getSlotNodes(next, location.address)
  if (!(location && source)) {
    return definition
  }
  const [node] = source.splice(location.index, 1)
  const destination = getSlotNodes(next, target)
  if (!(node && destination)) {
    return definition
  }
  const sameList = source === destination
  const adjusted = sameList && location.index < index ? index - 1 : index
  destination.splice(
    Math.max(0, Math.min(adjusted, destination.length)),
    0,
    node,
  )
  return next
}

export const duplicateNode = (
  definition: MiniAppDefinition,
  nodeId: string,
): { definition: MiniAppDefinition; nodeId?: string } => {
  const location = findNode(definition, nodeId)
  if (!location) {
    return { definition }
  }
  const copy = cloneNodeWithNewIds(location.node, collectAllNames(definition))
  return {
    definition: insertNode(
      definition,
      location.address,
      location.index + 1,
      copy,
    ),
    nodeId: copy.id,
  }
}
