import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { orpc } from "@/lib/orpc/query"
import { maxPerPage } from "@/lib/shared-request"

export const useAIAgents = (workspaceId: string | undefined) =>
  useQuery(
    orpc.aiAgentsAPI.listAIAgentsAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "", perPage: maxPerPage },
      enabled: Boolean(workspaceId),
      select: (res) => res.data,
    }),
  )

/** `{value,label}` pairs — the shape all consumers build by hand. */
export const useAIAgentSelectOptions = (workspaceId: string | undefined) => {
  const { data, isError } = useAIAgents(workspaceId)

  const options = useMemo(
    () =>
      (data ?? []).map((agent) => ({
        // `id` is a drizzle-zod custom-type column (bigintAsString) that
        // infers as `unknown`; it is always a string at runtime.
        value: agent.id as string,
        label: agent.name,
      })),
    [data],
  )

  return { options, isError }
}

/** Call after create/update/delete/change-default so every reader refetches. */
export const useInvalidateAIAgents = () => {
  const queryClient = useQueryClient()

  return () =>
    queryClient.invalidateQueries({ queryKey: orpc.aiAgentsAPI.key() })
}
