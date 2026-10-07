import type { MiniAppDefinition, MiniAppNode } from "./types"
import type { MiniAppValidationIssue } from "./validate"

/** A validation issue addressed in Flow JSON terms, for API callers. */
export interface MiniAppLocatedIssue {
  code: MiniAppValidationIssue["code"]
  params?: MiniAppValidationIssue["params"]
  /** JSON path of the component, e.g. `screens[0].layout.children[2].then[0]`. */
  path?: string
  property?: string
  /** Flow JSON screen id. */
  screenId?: string
  severity: MiniAppValidationIssue["severity"]
}

const slotPath = (node: MiniAppNode, slot: string): string =>
  node.type === "Switch" ? `cases.${slot}` : slot

const indexNodePaths = (
  nodes: readonly MiniAppNode[],
  base: string,
  paths: Map<string, string>,
) => {
  nodes.forEach((node, index) => {
    const path = `${base}[${index}]`
    paths.set(node.id, path)
    for (const [slot, children] of Object.entries(node.slots ?? {})) {
      indexNodePaths(children, `${path}.${slotPath(node, slot)}`, paths)
    }
  })
}

/** Rewrites editor-internal keys/ids into Flow JSON screen ids and paths. */
export const locateIssues = (
  definition: MiniAppDefinition,
  issues: readonly MiniAppValidationIssue[],
): MiniAppLocatedIssue[] => {
  const screenIds = new Map<string, string>()
  const paths = new Map<string, string>()
  definition.screens.forEach((screen, index) => {
    screenIds.set(screen.key, screen.id)
    indexNodePaths(screen.children, `screens[${index}].layout.children`, paths)
  })
  return issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    ...(issue.screenKey ? { screenId: screenIds.get(issue.screenKey) } : {}),
    ...(issue.nodeId ? { path: paths.get(issue.nodeId) } : {}),
    ...(issue.property ? { property: issue.property } : {}),
    ...(issue.params ? { params: issue.params } : {}),
  }))
}
