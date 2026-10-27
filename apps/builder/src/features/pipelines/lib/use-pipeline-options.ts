"use client"

import { useQuery } from "@tanstack/react-query"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import type { PipelineOptionsResponse } from "../schema/resource"

const NO_PIPELINES: PipelineOptionsResponse["data"] = []

/** Pipelines the member can view, with stages and status labels, for pickers. */
export function usePipelineOptions({
  enabled = true,
  workspaceId: explicitWorkspaceId,
}: {
  enabled?: boolean
  workspaceId?: string
} = {}) {
  const routeWorkspaceId = useWorkspaceId()
  const workspaceId = explicitWorkspaceId ?? routeWorkspaceId
  const query = useQuery({
    ...orpc.pipelinesAPI.privateListPipelineOptionsAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
    }),
    enabled: enabled && Boolean(workspaceId),
  })
  return {
    pipelines: query.data?.data ?? NO_PIPELINES,
    isLoading: query.isLoading,
  }
}
