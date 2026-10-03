import type { FlowNode } from "@chatbotx.io/flow-config"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { maxPerPage } from "@/lib/shared-request"

export type FlowStateFilter = {
  startType?: string
  integrationWhatsappId?: string
  integrationWhatsappIds?: string[]
}

export const useFlows = (
  workspaceId: string | undefined,
  options?: { enabled?: boolean; filter?: FlowStateFilter },
) =>
  useQuery(
    orpc.flowsAPI.privateListFlowsAPI.queryOptions({
      input: {
        workspaceId: workspaceId ?? "",
        perPage: maxPerPage,
        active: true,
        ...options?.filter,
      },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (res) => res.data,
    }),
  )

export const useInvalidateFlows = () => {
  const queryClient = useQueryClient()

  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: orpc.flowsAPI.privateListFlowsAPI.key(),
      }),
    [queryClient],
  )
}

export const useFlowSelectOptions = (options?: {
  enabled?: boolean
  filter?: FlowStateFilter
}) => {
  const workspaceId = useWorkspaceId()
  const { data: flows = [] } = useFlows(workspaceId, options)

  return useMemo(
    () =>
      flows.map((flow) => ({
        label: flow.name,
        value: flow.id.toString(),
      })),
    [flows],
  )
}

export const useFlowNodesSelectOptions = (options?: {
  enabled?: boolean
  filter?: FlowStateFilter
}) => {
  const workspaceId = useWorkspaceId()
  const { data: flows = [] } = useFlows(workspaceId, options)

  return useMemo(
    () =>
      flows.map((flow) => ({
        label: flow.name,
        value: flow.id.toString(),
        // In the template context, only nodes that actually send a template
        // are offered — the others can't be sent while a partner holds the
        // thread. Elsewhere every node is listed.
        children: getFlowNodesOptions(
          flow.flowVersions,
          options?.filter?.startType,
        ),
      })),
    [flows, options?.filter?.startType],
  )
}

/** Steps of a flow node, used to keep only nodes that run a given step type. */
type NodeWithSteps = { details?: { steps?: Array<{ stepType?: string }> } }
const nodeHasStepType = (node: FlowNode, stepType: string): boolean => {
  const steps = (node.data as NodeWithSteps)?.details?.steps
  return (
    Array.isArray(steps) && steps.some((step) => step?.stepType === stepType)
  )
}

export const getFlowNodesOptions = (
  flowVersions: FlowVersionResource[],
  stepTypeFilter?: string,
) => {
  const lastedFlowVersion = flowVersions.find(({ isLatest }) => isLatest)
  if (!lastedFlowVersion) {
    return []
  }

  return (lastedFlowVersion.nodes as FlowNode[])
    .filter((node) => !stepTypeFilter || nodeHasStepType(node, stepTypeFilter))
    .map((node: FlowNode) => ({
      label: node.data.name,
      value: node.id.toString(),
    }))
}
