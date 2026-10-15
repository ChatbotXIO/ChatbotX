import { MINI_APP_COMPONENTS } from "../components"
import type { MiniAppDefinition, MiniAppNode, MiniAppScreen } from "../types"
import { walkNodes } from "./walk"

/** A node's `name`, or undefined when it has none. */
export const nodeName = (node: MiniAppNode): string | undefined => {
  const name = node.props.name
  return typeof name === "string" && name ? name : undefined
}

/** The `name` of an input (a node that submits an answer), or undefined. */
export const inputName = (node: MiniAppNode): string | undefined =>
  MINI_APP_COMPONENTS[node.type].isInput ? nodeName(node) : undefined

/** Every `name` used on a screen (inputs, Forms, NavigationLists). */
export const collectScreenNames = (screen: MiniAppScreen): Set<string> => {
  const names = new Set<string>()
  walkNodes(screen.children, ({ node }) => {
    const name = nodeName(node)
    if (name) {
      names.add(name)
    }
  })
  return names
}

/** All names across the whole Mini App (names must be unique app-wide). */
export const collectAllNames = (definition: MiniAppDefinition): Set<string> => {
  const names = new Set<string>()
  for (const screen of definition.screens) {
    for (const name of collectScreenNames(screen)) {
      names.add(name)
    }
  }
  return names
}

/** Input names of a screen, in document order. */
export const collectInputNames = (screen: MiniAppScreen): string[] => {
  const names: string[] = []
  walkNodes(screen.children, ({ node }) => {
    const name = inputName(node)
    if (name) {
      names.push(name)
    }
  })
  return names
}

/** `base_1`, or the first `base_N` not taken yet. */
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
