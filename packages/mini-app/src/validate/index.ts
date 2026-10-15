import { collectInputNames } from "../tree"
import { miniAppDefinitionSchema } from "../types"
import { IssueCollector, type MiniAppValidationResult } from "./issues"
import { checkUniqueInputNames } from "./names"
import { checkScreens } from "./screens"
import { checkStructure } from "./structure"

export type {
  MiniAppIssueCode,
  MiniAppValidationIssue,
  MiniAppValidationResult,
} from "./issues"

/**
 * Checks a definition against Meta's Flow JSON rules. Errors block saving a
 * publishable flow; warnings are shown but do not block.
 */
export const validateMiniApp = (input: unknown): MiniAppValidationResult => {
  const collector = new IssueCollector()
  const parsed = miniAppDefinitionSchema.safeParse(input)
  if (!parsed.success) {
    collector.add({ code: "definition_invalid" })
    return { valid: false, issues: collector.issues }
  }
  const definition = parsed.data
  checkScreens(definition, collector)

  const screenKeys = new Set(definition.screens.map((screen) => screen.key))
  const namesByScreenId = new Map(
    definition.screens.map((screen) => [
      screen.id,
      new Set(collectInputNames(screen)),
    ]),
  )
  for (const screen of definition.screens) {
    checkStructure({
      definition,
      screen,
      screenKeys,
      localNames: namesByScreenId.get(screen.id) ?? new Set(),
      namesByScreenId,
      collector,
    })
  }
  checkUniqueInputNames(definition, collector)

  return {
    valid: !collector.issues.some((issue) => issue.severity === "error"),
    issues: collector.issues,
  }
}
