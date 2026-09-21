import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { maxPerPage } from "@/lib/shared-request"

export const useSequences = (
  workspaceId: string | undefined,
  options?: { enabled?: boolean },
) =>
  useQuery(
    orpc.sequencesAPI.listSequencesWorkspaceAuthAPI.queryOptions({
      input: {
        workspaceId: workspaceId ?? "",
        perPage: maxPerPage,
        active: true,
      },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (res) => res.data,
    }),
  )

export const useInvalidateSequences = () => {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      queryKey: orpc.sequencesAPI.listSequencesWorkspaceAuthAPI.key(),
    })
}

export const useSequenceOptions = (options?: {
  enabled?: boolean
}): { id: string; name: string }[] => {
  const workspaceId = useWorkspaceId()
  const { data: sequences = [] } = useSequences(workspaceId, options)

  return useMemo(
    () =>
      sequences.map((sequence) => ({
        id: sequence.id,
        name: sequence.name,
      })),
    [sequences],
  )
}
