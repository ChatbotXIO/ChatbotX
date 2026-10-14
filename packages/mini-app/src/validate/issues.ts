import type { z } from "zod"
import type { MiniAppDefinition, MiniAppNode, MiniAppScreen } from "../types"

export type MiniAppIssueCode =
  | "definition_invalid"
  | "screen_id_invalid"
  | "screen_id_reserved"
  | "screen_id_duplicate"
  | "no_terminal_screen"
  | "screen_without_exit"
  | "screen_unreachable"
  | "too_many_components"
  | "component_limit"
  | "picker_conflict"
  | "picker_multiple_in_complete"
  | "footer_not_last"
  | "footer_in_nested_branch"
  | "footer_missing_in_branch"
  | "navigation_list_with_footer"
  | "navigation_list_on_terminal"
  | "if_too_deep"
  | "if_then_empty"
  | "switch_no_cases"
  | "child_not_allowed"
  | "name_invalid"
  | "name_duplicate"
  | "property_required"
  | "property_too_long"
  | "property_too_short"
  | "property_invalid"
  | "option_duplicate_id"
  | "min_greater_than_max"
  | "action_required"
  | "action_not_allowed"
  | "navigate_target_missing"
  | "navigate_self"
  | "expression_invalid"
  | "reference_invalid"
  | "reference_unknown"
  | "data_reference_unsupported"
  | "property_unknown"
  | "footer_captions_invalid"
  | "options_with_images_limit"
  | "navigation_badge_multiple"
  | "contact_variable_whatsapp"

export interface MiniAppValidationIssue {
  code: MiniAppIssueCode
  nodeId?: string
  params?: Record<string, string | number>
  /** Dotted property path inside the node, when the issue is about one property. */
  property?: string
  screenKey?: string
  severity: "error" | "warning"
}

export interface MiniAppValidationResult {
  issues: MiniAppValidationIssue[]
  valid: boolean
}

/** An issue as reported by a check; the severity defaults to `"error"`. */
export type ReportedIssue = Omit<MiniAppValidationIssue, "severity"> & {
  severity?: "error" | "warning"
}

export class IssueCollector {
  readonly issues: MiniAppValidationIssue[] = []

  add(issue: ReportedIssue) {
    this.issues.push({ severity: "error", ...issue })
  }
}

/** What the per-screen checks need to know about the screen and the app. */
export interface ScreenContext {
  collector: IssueCollector
  definition: MiniAppDefinition
  /** Names reachable as `${form.x}` on this screen. */
  localNames: Set<string>
  /** Names per screen id, for `${screen.ID.form.x}`. */
  namesByScreenId: Map<string, Set<string>>
  screen: MiniAppScreen
  screenKeys: Set<string>
}

/** Reports issues about one node, with its screen and id already filled in. */
export type NodeReporter = (
  issue: Omit<ReportedIssue, "screenKey" | "nodeId">,
) => void

export const nodeReporter =
  (context: ScreenContext, node: MiniAppNode): NodeReporter =>
  (issue) =>
    context.collector.add({
      screenKey: context.screen.key,
      nodeId: node.id,
      ...issue,
    })

/** The issue code (and its params) for a props schema error. */
export const issueFromZod = (
  issue: z.core.$ZodIssue,
): Pick<MiniAppValidationIssue, "code" | "params"> => {
  switch (issue.code) {
    case "too_big":
      return {
        code: "property_too_long",
        params: { max: Number(issue.maximum) },
      }
    case "too_small":
      return Number(issue.minimum) <= 1 && issue.origin === "string"
        ? { code: "property_required" }
        : { code: "property_too_short", params: { min: Number(issue.minimum) } }
    case "custom":
      return issue.message === "duplicate_option_id"
        ? { code: "option_duplicate_id" }
        : { code: "property_invalid" }
    case "unrecognized_keys":
      return {
        code: "property_unknown",
        params: { name: issue.keys.join(", ") },
      }
    case "invalid_type":
      return issue.input === undefined
        ? { code: "property_required" }
        : { code: "property_invalid" }
    default:
      return { code: "property_invalid" }
  }
}
