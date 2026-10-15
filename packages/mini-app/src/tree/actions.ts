import {
  type MiniAppAction,
  type MiniAppNode,
  type MiniAppScreen,
  miniAppActionSchema,
} from "../types"
import { walkNodes } from "./walk"

/** The prop holding a node's (or a NavigationList item's) action. */
export const MINI_APP_ACTION_KEY = "on-click-action"
/** The NavigationList prop holding its items, each of which may hold an action. */
export const MINI_APP_LIST_ITEMS_KEY = "list-items"

/** The action in a `MINI_APP_ACTION_KEY` prop, or undefined when it is not a valid one. */
export const readMiniAppAction = (
  value: unknown,
): MiniAppAction | undefined => {
  const parsed = miniAppActionSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

/**
 * The objects that can hold an action under `MINI_APP_ACTION_KEY`: the node's
 * props, then each NavigationList item. Returned live, so a caller may
 * rewrite an action in place.
 */
export const actionHolders = (node: MiniAppNode): Record<string, unknown>[] => {
  const items = node.props[MINI_APP_LIST_ITEMS_KEY]
  return [node.props, ...(Array.isArray(items) ? items.filter(isRecord) : [])]
}

/** Every action on a screen: node actions and NavigationList item actions. */
export const screenActions = (screen: MiniAppScreen): MiniAppAction[] => {
  const actions: MiniAppAction[] = []
  walkNodes(screen.children, ({ node }) => {
    for (const holder of actionHolders(node)) {
      const action = readMiniAppAction(holder[MINI_APP_ACTION_KEY])
      if (action) {
        actions.push(action)
      }
    }
  })
  return actions
}

/**
 * A screen ends the flow when it has a `complete` action — there is no flag
 * to keep in sync, so the end-flow button can move freely between screens.
 */
export const isTerminalScreen = (screen: MiniAppScreen): boolean =>
  screenActions(screen).some((action) => action.name === "complete")
