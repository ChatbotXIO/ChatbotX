import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { maxPerPage } from "@/lib/shared-request"

type SequenceQueryOptions = {
  enabled?: boolean
  /** Also list paused sequences; by default only active ones are listed. */
  includeInactive?: boolean
}

export const useSequences = (
  workspaceId: string | undefined,
  options?: SequenceQueryOptions,
) =>
  useQuery(
    orpc.sequencesAPI.listSequencesWorkspaceAuthAPI.queryOptions({
      input: {
        workspaceId: workspaceId ?? "",
        perPage: maxPerPage,
        ...(options?.includeInactive ? {} : { active: true }),
      },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (res) => res.data,
    }),
  )

export const useInvalidateSequences = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: orpc.sequencesAPI.listSequencesWorkspaceAuthAPI.key(),
      }),
    [queryClient],
  )
}

export const useSequenceOptions = (
  options?: SequenceQueryOptions,
): { id: string; name: string }[] => {
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

/** Sequences as `{ label, value }` select options, like `useTagSelectOptions`. */
export const useSequenceSelectOptions = (
  options?: SequenceQueryOptions,
): { label: string; value: string }[] => {
  const sequences = useSequenceOptions(options)

  return useMemo(
    () => sequences.map(({ id, name }) => ({ label: name, value: id })),
    [sequences],
  )
}
