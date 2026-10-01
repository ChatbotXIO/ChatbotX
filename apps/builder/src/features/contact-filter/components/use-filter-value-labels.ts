"use client"

import { useQuery } from "@tanstack/react-query"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import {
  collectFilterValueIds,
  type FilterValueCondition,
} from "../lib/filter-value-labels"
import type { ResolveFilterValueLabelsResponse } from "../schema/value-labels"

/**
 * Names for the ids a filter references, fetched by id so the result is exact
 * however many tags/sequences/... the workspace has. `undefined` while loading
 * or when the lookup is not possible or failed — callers then show what they
 * already had.
 */
export const useFilterValueLabels = (
  conditions: readonly FilterValueCondition[],
): ResolveFilterValueLabelsResponse | undefined => {
  const workspaceId = useWorkspaceId()
  // Query keys are hashed by value, so rebuilding `ids` on every render does
  // not refetch while the referenced ids are unchanged.
  const ids = collectFilterValueIds(conditions)

  const { data } = useQuery(
    orpc.contactFilterAPI.resolveFilterValueLabelsAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "", ...ids },
      enabled: Boolean(workspaceId) && ids !== undefined,
      // Names change when an entity is renamed or deleted elsewhere, and no
      // mutation invalidates this key: refetch on each mount (a cheap bounded
      // lookup) rather than serve a cached name for a deleted entity.
      staleTime: 0,
    }),
  )
  return data
}
