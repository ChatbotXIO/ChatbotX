import { inputName, walkNodes } from "../tree"
import type { MiniAppDefinition } from "../types"
import type { IssueCollector } from "./issues"

/**
 * Input names must be unique across the whole app: answers are keyed by name.
 * Duplicates on the same screen are reported by `checkStructure`.
 */
export const checkUniqueInputNames = (
  definition: MiniAppDefinition,
  collector: IssueCollector,
) => {
  const screenKeyByName = new Map<string, string>()
  for (const screen of definition.screens) {
    walkNodes(screen.children, ({ node }) => {
      const name = inputName(node)
      if (!name) {
        return
      }
      const ownerScreen = screenKeyByName.get(name)
      if (ownerScreen && ownerScreen !== screen.key) {
        collector.add({
          screenKey: screen.key,
          nodeId: node.id,
          property: "name",
          code: "name_duplicate",
          params: { name },
        })
      }
      screenKeyByName.set(name, screen.key)
    })
  }
}
