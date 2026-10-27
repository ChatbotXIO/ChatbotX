"use client"

import { useQuery } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

/** One pipeline's settings, stages, fields and the caller's permissions. */
export function usePipelineDetail(
  workspaceId: string,
  pipelineId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    ...orpc.pipelinesAPI.privateGetPipelineAPI.queryOptions({
      input: { workspaceId, pipelineId },
    }),
    enabled,
  })
}
