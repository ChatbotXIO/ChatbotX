import {
  defaultMiniAppText,
  defaultSlotsFor,
  MINI_APP_COMPONENTS,
  type MiniAppDefaultText,
  NAMED_COMPONENT_TYPES,
} from "./components"
import type {
  MiniAppComponentType,
  MiniAppDefinition,
  MiniAppNode,
  MiniAppScreen,
} from "./types"

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

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

export const createMiniAppId = (prefix = "n"): string => {
  let id = ""
  for (let index = 0; index < 10; index++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  }
  return `${prefix}_${id}`
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
    for (const [slot, children] of Object.entries(node.slots)) {
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

const clone = <T>(value: T): T => structuredClone(value)

export const insertNode = (
  definition: MiniAppDefinition,
  address: MiniAppSlotAddress,
  index: number,
  node: MiniAppNode,
): MiniAppDefinition => {
  const next = clone(definition)
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
  const next = clone(definition)
  const location = findNode(next, nodeId)
  if (!location) {
    return definition
  }
  getSlotNodes(next, location.address)?.splice(location.index, 1)
  return next
}

export const updateNodeProps = (
  definition: MiniAppDefinition,
  nodeId: string,
  props: Record<string, unknown>,
): MiniAppDefinition => {
  const next = clone(definition)
  const location = findNode(next, nodeId)
  if (!location) {
    return definition
  }
  location.node.props = props
  return next
}

export const updateNodeCustomField = (
  definition: MiniAppDefinition,
  nodeId: string,
  customFieldId: string | null,
): MiniAppDefinition => {
  const next = clone(definition)
  const location = findNode(next, nodeId)
  if (!location) {
    return definition
  }
  if (customFieldId) {
    location.node.customFieldId = customFieldId
  } else {
    location.node.customFieldId = undefined
  }
  return next
}

export const updateNodeSlots = (
  definition: MiniAppDefinition,
  nodeId: string,
  slots: Record<string, MiniAppNode[]>,
): MiniAppDefinition => {
  const next = clone(definition)
  const location = findNode(next, nodeId)
  if (!location) {
    return definition
  }
  location.node.slots = slots
  return next
}

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
  const next = clone(definition)
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

const NAME_COUNTER_SUFFIX = /_\d+$/

const toSnakeCase = (value: string): string =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()

/** Every `name` used on a screen (inputs, Forms, NavigationLists). */
export const collectScreenNames = (screen: MiniAppScreen): Set<string> => {
  const names = new Set<string>()
  walkNodes(screen.children, ({ node }) => {
    const name = node.props.name
    if (typeof name === "string" && name) {
      names.add(name)
    }
  })
  return names
}

/** All input names across the whole Mini App (names must be unique app-wide). */
export const collectAllNames = (definition: MiniAppDefinition): Set<string> => {
  const names = new Set<string>()
  for (const screen of definition.screens) {
    for (const name of collectScreenNames(screen)) {
      names.add(name)
    }
  }
  return names
}

export const uniqueName = (
  base: string,
  taken: ReadonlySet<string>,
): string => {
  let counter = 1
  while (taken.has(`${base}_${counter}`)) {
    counter++
  }
  return `${base}_${counter}`
}

const needsName = (type: MiniAppComponentType): boolean =>
  MINI_APP_COMPONENTS[type].isInput || NAMED_COMPONENT_TYPES.has(type)

export const createNode = (
  type: MiniAppComponentType,
  takenNames: Set<string>,
  text: MiniAppDefaultText = defaultMiniAppText,
): MiniAppNode => {
  const props = MINI_APP_COMPONENTS[type].defaultProps(text)
  if (needsName(type)) {
    const name = uniqueName(toSnakeCase(type), takenNames)
    takenNames.add(name)
    props.name = name
  }
  const slots = defaultSlotsFor(type)
  return { id: createMiniAppId(), type, props, ...(slots ? { slots } : {}) }
}

/** Deep-copies a node with fresh ids and fresh (unique) names. */
export const cloneNodeWithNewIds = (
  node: MiniAppNode,
  takenNames: Set<string>,
): MiniAppNode => {
  const copy = clone(node)
  walkNodes([copy], ({ node: current }) => {
    current.id = createMiniAppId()
    if (needsName(current.type)) {
      const base = String(
        current.props.name ?? toSnakeCase(current.type),
      ).replace(NAME_COUNTER_SUFFIX, "")
      const name = uniqueName(base || toSnakeCase(current.type), takenNames)
      takenNames.add(name)
      current.props.name = name
    }
  })
  return copy
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

const SCREEN_ID_PREFIX = "SCREEN"
const ALPHABET_SIZE = 26
const CHAR_CODE_A = 65

/**
 * 1 → A, 26 → Z, 27 → AA, 52 → AZ, 702 → ZZ, 703 → AAA (spreadsheet columns).
 * Screen ids allow only letters and underscores, so no digits are used.
 */
export const toAlphabeticIndex = (position: number): string => {
  let remaining = position
  let label = ""
  while (remaining > 0) {
    const offset = (remaining - 1) % ALPHABET_SIZE
    label = String.fromCharCode(CHAR_CODE_A + offset) + label
    remaining = Math.floor((remaining - 1) / ALPHABET_SIZE)
  }
  return label
}

/** Takes the first free id in the sequence SCREEN_A, SCREEN_B, … SCREEN_Z, SCREEN_AA, … */
export const createScreen = (
  definition: MiniAppDefinition,
  title: string,
): MiniAppScreen => {
  const taken = new Set(definition.screens.map((screen) => screen.id))
  let position = 1
  while (taken.has(`${SCREEN_ID_PREFIX}_${toAlphabeticIndex(position)}`)) {
    position++
  }
  return {
    key: createMiniAppId("s"),
    id: `${SCREEN_ID_PREFIX}_${toAlphabeticIndex(position)}`,
    title,
    terminal: false,
    children: [],
  }
}

/** A one-screen starter app: a heading and a Footer that completes the flow. */
export const createStarterDefinition = (
  screenTitle: string,
  text: MiniAppDefaultText = defaultMiniAppText,
): MiniAppDefinition => {
  const names = new Set<string>()
  const footer = createNode("Footer", names, text)
  footer.props["on-click-action"] = { name: "complete" }
  return {
    screens: [
      {
        key: createMiniAppId("s"),
        id: "WELCOME",
        title: screenTitle,
        terminal: true,
        children: [createNode("TextHeading", names, text), footer],
      },
    ],
  }
}

/** Removes a screen and clears every `navigate` that pointed at it. */
export const removeScreen = (
  definition: MiniAppDefinition,
  screenKey: string,
): MiniAppDefinition => {
  if (definition.screens.length <= 1) {
    return definition
  }
  const next = clone(definition)
  next.screens = next.screens.filter((screen) => screen.key !== screenKey)
  for (const screen of next.screens) {
    walkNodes(screen.children, ({ node }) => {
      const action = node.props["on-click-action"] as
        | { name?: string; next?: string }
        | undefined
      if (action?.name === "navigate" && action.next === screenKey) {
        node.props["on-click-action"] = undefined
      }
      const items = node.props["list-items"]
      if (Array.isArray(items)) {
        for (const item of items as Record<string, unknown>[]) {
          const itemAction = item["on-click-action"] as
            | { name?: string; next?: string }
            | undefined
          if (
            itemAction?.name === "navigate" &&
            itemAction.next === screenKey
          ) {
            item["on-click-action"] = undefined
          }
        }
      }
    })
  }
  return next
}
