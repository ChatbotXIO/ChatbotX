"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

/** Invalidates every cached poll query (list, detail, links, analytics). */
export const useInvalidatePolls = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: orpc.pollsAPI.key(),
      }),
    [queryClient],
  )
}
