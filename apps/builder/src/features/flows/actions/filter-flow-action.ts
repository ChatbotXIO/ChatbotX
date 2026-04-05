import type { FlowNode } from "../schemas/flow-node"
import type { FlowWithVersionsResource } from "../schemas/resource"

export function hasStartNode(nodes: FlowNode[], stepType: string): boolean {
  if (!Array.isArray(nodes)) {
    return false
  }

  return nodes
    .filter((node) => node?.data?.isStartNode === true)
    .some((node) =>
      node?.data?.details?.steps?.some((step) => step?.stepType === stepType),
    )
}

export function filterFlowsByStartStepType(
  flows: FlowWithVersionsResource[],
  stepType: string,
): FlowWithVersionsResource[] {
  return flows.filter((flow) =>
    flow.flowVersions.some((version) =>
      // biome-ignore lint/suspicious/noExplicitAny: temporary any
      hasStartNode(version.nodes as any[], stepType),
    ),
  )
}

export function filterFlowsByTemplateIds<T extends FlowWithVersionsResource>(
  flows: T[],
  templateIds: string[],
): T[] {
  if (!Array.isArray(flows) || templateIds.length === 0) {
    return []
  }

  return flows.filter((flow) =>
    flow.flowVersions.some((version) => {
      if (!Array.isArray(version.nodes)) {
        return false
      }

      return version.nodes.some((node) => {
        // biome-ignore lint/suspicious/noExplicitAny: temporary any
        const steps = (node as any)?.data?.details?.steps
        if (!Array.isArray(steps)) {
          return false
        }

        return steps.some((step) => {
          if (step?.stepType !== "WA_TM01") {
            return false
          }

          const stepWithTemplate = step as unknown as {
            template?: { id?: string }
          }
          const templateId = stepWithTemplate?.template?.id
          return (
            typeof templateId === "string" && templateIds.includes(templateId)
          )
        })
      })
    }),
  )
}
