import {
  defaultMiniAppText,
  defaultSlotsFor,
  MINI_APP_COMPONENTS,
  type MiniAppDefaultText,
  needsName,
} from "../components"
import type {
  MiniAppComponentType,
  MiniAppDefinition,
  MiniAppNode,
  MiniAppScreen,
} from "../types"
import { MINI_APP_ACTION_KEY } from "./actions"
import { uniqueName } from "./names"
import { walkNodes } from "./walk"

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
const ID_RANDOM_LENGTH = 10

/** A random id such as `n_k3x9…`; `n` for nodes, `s` for screen keys. */
export const createMiniAppId = (prefix = "n"): string => {
  let id = ""
  for (let index = 0; index < ID_RANDOM_LENGTH; index++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  }
  return `${prefix}_${id}`
}

const NAME_COUNTER_SUFFIX = /_\d+$/

const toSnakeCase = (value: string): string =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()

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
  return {
    id: createMiniAppId(),
    type,
    props,
    ...(slots ? { slots, slotOrder: Object.keys(slots) } : {}),
  }
}

/** Deep-copies a node with fresh ids and fresh (unique) names. */
export const cloneNodeWithNewIds = (
  node: MiniAppNode,
  takenNames: Set<string>,
): MiniAppNode => {
  const copy = structuredClone(node)
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

/** A Footer that ends the flow. */
export const createCompleteFooter = (
  takenNames: Set<string>,
  text: MiniAppDefaultText = defaultMiniAppText,
): MiniAppNode => {
  const footer = createNode("Footer", takenNames, text)
  footer.props[MINI_APP_ACTION_KEY] = { name: "complete" }
  return footer
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
    children: [],
  }
}

/** Flow JSON id of the only screen of a starter app. */
const STARTER_SCREEN_ID = "WELCOME"

/** A one-screen starter app: a heading and a Footer that completes the flow. */
export const createStarterDefinition = (
  screenTitle: string,
  text: MiniAppDefaultText = defaultMiniAppText,
): MiniAppDefinition => {
  const names = new Set<string>()
  const footer = createCompleteFooter(names, text)
  return {
    screens: [
      {
        key: createMiniAppId("s"),
        id: STARTER_SCREEN_ID,
        title: screenTitle,
        children: [createNode("TextHeading", names, text), footer],
      },
    ],
  }
}
