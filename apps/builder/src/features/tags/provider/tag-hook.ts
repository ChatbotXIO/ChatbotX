import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { maxPerPage } from "@/lib/shared-request"

export const useTags = (
  workspaceId: string | undefined,
  options?: { enabled?: boolean },
) =>
  useQuery(
    orpc.tagsAPI.privateListWorkspaceTagsAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "", perPage: maxPerPage },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (res) => res.data,
    }),
  )

/** Call after create/update/delete so every reader refetches. */
export const useInvalidateTags = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: orpc.tagsAPI.key() })
}

export const useTagOptions = (): string[] => {
  const workspaceId = useWorkspaceId()
  const { data } = useTags(workspaceId)

  return useMemo(() => (data ?? []).map((tag) => tag.name), [data])
}

export const useTagSelectOptions = ({
  prefix,
}: {
  prefix?: string
} = {}): { label: string; value: string }[] => {
  const workspaceId = useWorkspaceId()
  const { data } = useTags(workspaceId)

  return useMemo(
    () =>
      (data ?? []).map((tag) => ({
        label: tag.name,
        value: prefix ? `${prefix}:${tag.id}` : tag.id,
      })),
    [data, prefix],
  )
}
