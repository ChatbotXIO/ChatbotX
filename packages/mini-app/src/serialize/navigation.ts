import { collectInputNames, screenActions } from "../tree"
import type { MiniAppDefinition } from "../types"

/** Every navigate target per screen key. */
export const buildNavigationGraph = (
  definition: MiniAppDefinition,
): Map<string, Set<string>> =>
  new Map(
    definition.screens.map((screen) => [
      screen.key,
      new Set(
        screenActions(screen).flatMap((action) =>
          action.name === "navigate" ? [action.next] : [],
        ),
      ),
    ]),
  )

/** Screen keys from which `screenKey` can be reached (including itself). */
export const collectPathScreens = (
  definition: MiniAppDefinition,
  screenKey: string,
): Set<string> => {
  const graph = buildNavigationGraph(definition)
  const reached = new Set<string>([screenKey])
  let changed = true
  while (changed) {
    changed = false
    for (const [source, targets] of graph) {
      if (reached.has(source)) {
        continue
      }
      if ([...targets].some((target) => reached.has(target))) {
        reached.add(source)
        changed = true
      }
    }
  }
  return reached
}

/**
 * The `complete` payload for a screen: every input on the screens that can
 * lead to it, keyed by input name (names are unique app-wide).
 */
export const buildCompletePayload = (
  definition: MiniAppDefinition,
  screenKey: string,
): Record<string, string> => {
  const onPath = collectPathScreens(definition, screenKey)
  const payload: Record<string, string> = {}
  for (const screen of definition.screens) {
    if (!onPath.has(screen.key)) {
      continue
    }
    for (const name of collectInputNames(screen)) {
      payload[name] =
        screen.key === screenKey
          ? `\${form.${name}}`
          : `\${screen.${screen.id}.form.${name}}`
    }
  }
  return payload
}
