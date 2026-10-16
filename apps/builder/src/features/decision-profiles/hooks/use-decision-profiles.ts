"use client"

import { useQueryClient } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

export const useInvalidateDecisionProfiles = () => {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({ queryKey: orpc.decisionProfilesAPI.key() })
}
