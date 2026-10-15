import { defaultMiniAppText, type MiniAppDefaultText } from "../components"
import type { MiniAppDefinition, MiniAppScreen } from "../types"
import {
  actionHolders,
  MINI_APP_ACTION_KEY,
  readMiniAppAction,
} from "./actions"
import { createCompleteFooter, createScreen } from "./factory"
import { collectAllNames } from "./names"
import { walkNodes } from "./walk"

/** What a screen is called in the editor: its title, or its id when untitled. */
export const screenLabel = (screen: MiniAppScreen): string =>
  screen.title || screen.id

/** Removes a screen and clears every `navigate` that pointed at it. */
export const removeScreen = (
  definition: MiniAppDefinition,
  screenKey: string,
): MiniAppDefinition => {
  if (definition.screens.length <= 1) {
    return definition
  }
  const next = structuredClone(definition)
  next.screens = next.screens.filter((screen) => screen.key !== screenKey)
  const lastScreen = next.screens.at(-1)
  for (const screen of next.screens) {
    walkNodes(screen.children, ({ node }) => {
      for (const holder of actionHolders(node)) {
        const action = readMiniAppAction(holder[MINI_APP_ACTION_KEY])
        if (action?.name !== "navigate" || action.next !== screenKey) {
          continue
        }
        // The Footer that led to a removed last screen now ends the flow.
        const endsFlow =
          holder === node.props &&
          screen === lastScreen &&
          node.type === "Footer"
        holder[MINI_APP_ACTION_KEY] = endsFlow
          ? { name: "complete" }
          : undefined
      }
    })
  }
  return next
}

/**
 * Appends a new screen and moves the end of the flow onto it: every
 * `complete` on the previous last screen now navigates to the new screen,
 * which gets a Footer that completes the flow.
 */
export const appendScreen = (
  definition: MiniAppDefinition,
  title: string,
  text: MiniAppDefaultText = defaultMiniAppText,
): { definition: MiniAppDefinition; screenKey: string } => {
  const next = structuredClone(definition)
  const screen = createScreen(next, title)
  const previous = next.screens.at(-1)
  if (previous) {
    walkNodes(previous.children, ({ node }) => {
      if (
        readMiniAppAction(node.props[MINI_APP_ACTION_KEY])?.name === "complete"
      ) {
        node.props[MINI_APP_ACTION_KEY] = { name: "navigate", next: screen.key }
      }
    })
  }
  screen.children.push(createCompleteFooter(collectAllNames(next), text))
  next.screens.push(screen)
  return { definition: next, screenKey: screen.key }
}
