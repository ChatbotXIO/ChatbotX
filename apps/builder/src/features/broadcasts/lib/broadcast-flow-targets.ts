import { findTemplateStartStep } from "@chatbotx.io/flow-config"
import type {
  BroadcastPage,
  PageTemplateSummary,
} from "./broadcast-target-groups"

/** The slice of a flow the page matching reads. */
export type FlowForTargets = {
  id: string
  name: string
  flowVersions: { isLatest?: boolean | null; nodes: unknown }[]
}

/**
 * The template id of the flow's start-step template send (`stepType`), read
 * from its PUBLISHED (`isLatest`) version only — the same version the server
 * validates against (`listOwnedTargetFlows`) and the worker can execute. A
 * flow with only a draft version is not sendable, so it ties to no page and
 * is offered nowhere. A flow's template step is bound to one page, so this is
 * what ties a flow to a page.
 */
export function findFlowStartTemplateId(
  flow: FlowForTargets,
  stepType: string,
): string | undefined {
  const publishedVersion = flow.flowVersions.find(
    (candidate) => candidate.isLatest,
  )
  return findTemplateStartStep(publishedVersion?.nodes, stepType)?.templateId
}

export type TargetFlowOption = { label: string; value: string }

/**
 * The flows a page's picker offers: every flow whose start template belongs
 * to that page. Mirrors the server's ownership rule (`listOwnedTargetFlows`)
 * exactly — page-bound via the start-template's `inboxId`, with no approved-
 * status filter, since `templatesById` already holds the full template list.
 */
export function buildTargetFlowOptions(input: {
  flows: readonly FlowForTargets[]
  page: BroadcastPage
  templatesById: ReadonlyMap<string, PageTemplateSummary>
  stepType: string
}): TargetFlowOption[] {
  const { flows, page, templatesById, stepType } = input
  return flows.flatMap((flow) => {
    const templateId = findFlowStartTemplateId(flow, stepType)
    const template = templateId ? templatesById.get(templateId) : undefined
    return template && template.inboxId === page.inboxId
      ? [{ label: flow.name, value: flow.id }]
      : []
  })
}
