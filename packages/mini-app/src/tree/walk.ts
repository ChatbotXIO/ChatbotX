import type {
  MiniAppComponentType,
  MiniAppDefinition,
  MiniAppNode,
  MiniAppScreen,
} from "../types"

/** Where a list of nodes lives: a screen root, or one slot of a container. */
export interface MiniAppSlotAddress {
  parentId?: string
  screenKey: string
  slot?: string
}

export interface MiniAppNodeVisit {
  /** Number of `If` containers above this node. */
  ifDepth: number
  /** Whether the node sits inside an `If` or `Switch` branch. */
  inConditional: boolean
  index: number
  node: MiniAppNode
  parent?: MiniAppNode
  slot?: string
}

/** Slot keys a container lists first when no `slotOrder` is stored. */
const DEFAULT_SLOT_ORDER: Partial<Record<MiniAppComponentType, string[]>> = {
  If: ["then", "else"],
}

/**
 * A container's slots in display order: `slotOrder` first, then the defaults
 * for its type, then any remaining key. Never trust plain object key order —
 * a jsonb round trip sorts the keys.
 */
export const slotEntries = (
  node: MiniAppNode,
): [slot: string, children: MiniAppNode[]][] => {
  const slots = node.slots
  if (!slots) {
    return []
  }
  const keys = new Set<string>()
  for (const key of [
    ...(node.slotOrder ?? []),
    ...(DEFAULT_SLOT_ORDER[node.type] ?? []),
    ...Object.keys(slots),
  ]) {
    if (key in slots) {
      keys.add(key)
    }
  }
  return [...keys].map((key) => [key, slots[key] ?? []])
}

export const walkNodes = (
  nodes: readonly MiniAppNode[],
  visit: (entry: MiniAppNodeVisit) => void,
  context: {
    parent?: MiniAppNode
    slot?: string
    ifDepth: number
    inConditional: boolean
  } = {
    ifDepth: 0,
    inConditional: false,
  },
): void => {
  nodes.forEach((node, index) => {
    visit({ node, index, ...context })
    if (!node.slots) {
      return
    }
    const isIf = node.type === "If"
    const isConditional = isIf || node.type === "Switch"
    for (const [slot, children] of slotEntries(node)) {
      walkNodes(children, visit, {
        parent: node,
        slot,
        ifDepth: context.ifDepth + (isIf ? 1 : 0),
        inConditional: context.inConditional || isConditional,
      })
    }
  })
}

export const flattenNodes = (nodes: readonly MiniAppNode[]): MiniAppNode[] => {
  const result: MiniAppNode[] = []
  walkNodes(nodes, ({ node }) => result.push(node))
  return result
}

export const findScreen = (
  definition: MiniAppDefinition,
  screenKey: string,
): MiniAppScreen | undefined =>
  definition.screens.find((screen) => screen.key === screenKey)

export interface MiniAppNodeLocation {
  address: MiniAppSlotAddress
  index: number
  node: MiniAppNode
  screen: MiniAppScreen
}

export const findNode = (
  definition: MiniAppDefinition,
  nodeId: string,
): MiniAppNodeLocation | undefined => {
  for (const screen of definition.screens) {
    let location: MiniAppNodeLocation | undefined
    walkNodes(screen.children, ({ node, parent, slot, index }) => {
      if (!location && node.id === nodeId) {
        location = {
          screen,
          node,
          index,
          address: { screenKey: screen.key, parentId: parent?.id, slot },
        }
      }
    })
    if (location) {
      return location
    }
  }
  return
}

/** Returns the live array behind an address, or undefined when it does not exist. */
export const getSlotNodes = (
  definition: MiniAppDefinition,
  address: MiniAppSlotAddress,
): MiniAppNode[] | undefined => {
  const screen = findScreen(definition, address.screenKey)
  if (!screen) {
    return
  }
  if (!address.parentId) {
    return screen.children
  }
  const parent = findNode(definition, address.parentId)?.node
  if (!(parent?.slots && address.slot)) {
    return
  }
  return parent.slots[address.slot]
}

/** Resolves the container type that owns an address (`"Screen"` for the root). */
export const getSlotOwnerType = (
  definition: MiniAppDefinition,
  address: MiniAppSlotAddress,
): MiniAppComponentType | "Screen" | undefined => {
  if (!address.parentId) {
    return "Screen"
  }
  return findNode(definition, address.parentId)?.node.type
}

export const isDescendantOf = (
  definition: MiniAppDefinition,
  ancestorId: string,
  candidateId: string,
): boolean => {
  const ancestor = findNode(definition, ancestorId)?.node
  if (!ancestor?.slots) {
    return false
  }
  let found = false
  for (const children of Object.values(ancestor.slots)) {
    walkNodes(children, ({ node }) => {
      if (node.id === candidateId) {
        found = true
      }
    })
  }
  return found
}
