import { stepTypes } from "./step-action"

/**
 * Step types whose send is bound to one page's template — a flow starting
 * with one of them can only run on that page. `WA_TM01` is the pre-rename
 * WhatsApp step type still present in old flow versions.
 */
export const TEMPLATE_STEP_TYPE_ALIASES: Record<string, readonly string[]> = {
  [stepTypes.enum.sendWaTemplateMessage]: ["WA_TM01"],
  [stepTypes.enum.sendMessengerTemplateMessage]: [],
}

export const resolveStepTypeMatches = (stepType: string): readonly string[] => [
  stepType,
  ...(TEMPLATE_STEP_TYPE_ALIASES[stepType] ?? []),
]

export type TemplateStartStep = {
  stepType: string
  templateId: string
}

type StepRecord = { stepType?: unknown; template?: { id?: unknown } }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const nodeSteps = (node: unknown): readonly unknown[] => {
  if (!(isRecord(node) && isRecord(node.data))) {
    return []
  }
  const details = node.data.details
  return isRecord(details) && Array.isArray(details.steps) ? details.steps : []
}

const isStartNode = (node: unknown): boolean =>
  isRecord(node) && isRecord(node.data) && node.data.isStartNode === true

/**
 * The template step a flow starts with (`stepType` or its aliases), read
 * from a version's nodes. `null` when the flow does not open with that step
 * or the step has no template yet.
 */
export function findTemplateStartStep(
  nodes: unknown,
  stepType: string,
): TemplateStartStep | null {
  if (!Array.isArray(nodes)) {
    return null
  }
  const matches = resolveStepTypeMatches(stepType)

  for (const node of nodes.filter(isStartNode)) {
    for (const step of nodeSteps(node)) {
      const candidate = step as StepRecord
      const candidateType = asString(candidate.stepType)
      if (!(candidateType && matches.includes(candidateType))) {
        continue
      }
      const templateId = asString(candidate.template?.id)
      if (templateId) {
        return { stepType: candidateType, templateId }
      }
    }
  }
  return null
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined
