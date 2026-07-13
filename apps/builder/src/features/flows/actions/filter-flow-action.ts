import { stepTypes } from "@chatbotx.io/flow-config"
import type { FlowNode } from "../schemas/flow-node"

const LEGACY_STEP_TYPE_ALIASES: Record<string, readonly string[]> = {
  [stepTypes.enum.sendWaTemplateMessage]: ["WA_TM01"],
}

export const resolveStepTypeMatches = (stepType: string): readonly string[] => [
  stepType,
  ...(LEGACY_STEP_TYPE_ALIASES[stepType] ?? []),
]

type StepWithTemplate = {
  stepType?: string
  template?: { id?: string }
}

type FlowWithNodeVersions = {
  flowVersions: Array<{ nodes: unknown }>
}

const isFlowNode = (node: unknown): node is FlowNode =>
  typeof node === "object" && node !== null

export function hasStartNode(nodes: unknown, stepType: string): boolean {
  if (!Array.isArray(nodes)) {
    return false
  }

  const stepTypeMatches = resolveStepTypeMatches(stepType)

  return nodes
    .filter(isFlowNode)
    .filter((node) => node?.data?.isStartNode === true)
    .some((node) =>
      node?.data?.details?.steps?.some((step) =>
        stepTypeMatches.includes(step?.stepType ?? ""),
      ),
    )
}

export function filterFlowsByStartStepType<T extends FlowWithNodeVersions>(
  flows: T[],
  stepType: string,
): T[] {
  return flows.filter((flow) =>
    flow.flowVersions.some((version) => hasStartNode(version.nodes, stepType)),
  )
}

export function filterFlowsByTemplateIds<T extends FlowWithNodeVersions>(
  flows: T[],
  templateIds: string[],
): T[] {
  if (!Array.isArray(flows) || templateIds.length === 0) {
    return []
  }

  const whatsappTemplateStepTypes = resolveStepTypeMatches(
    stepTypes.enum.sendWaTemplateMessage,
  )

  return flows.filter((flow) =>
    flow.flowVersions.some((version) => {
      if (!Array.isArray(version.nodes)) {
        return false
      }

      return version.nodes
        .filter(isFlowNode)
        .filter((node) => node.data?.isStartNode === true)
        .some((node) => {
          const steps = node.data?.details?.steps
          if (!Array.isArray(steps)) {
            return false
          }

          return steps.some((step) => {
            if (!whatsappTemplateStepTypes.includes(step?.stepType ?? "")) {
              return false
            }

            const stepWithTemplate = step as StepWithTemplate
            const templateId = stepWithTemplate?.template?.id
            return (
              typeof templateId === "string" && templateIds.includes(templateId)
            )
          })
        })
    }),
  )
}
