"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

/** Workspace place categories (rank, then name) as select options. */
export function usePlaceCategoryOptions({ enabled = true } = {}) {
  const workspaceId = useWorkspaceId()
  const query = useQuery({
    ...orpc.placesNearMeAPI.listPlaceCategoryOptionsAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
    }),
    enabled: enabled && Boolean(workspaceId),
  })
  const categories = query.data?.data ?? []
  const options = useMemo(
    () =>
      categories.map((category) => ({
        label: category.name,
        value: category.id,
      })),
    [categories],
  )
  return { options, isLoading: query.isLoading }
}
