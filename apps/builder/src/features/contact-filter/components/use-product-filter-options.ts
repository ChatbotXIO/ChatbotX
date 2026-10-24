"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { orpc } from "@/lib/orpc/query"

/** The workspace's products, for the purchase and cart conditions. */
export const useProductFilterOptions = (workspaceId: string) => {
  const { data } = useQuery({
    ...orpc.productsAPI.listProductFormOptionsAPI.queryOptions({
      input: { workspaceId },
    }),
    staleTime: 60_000,
  })
  return useMemo(
    () =>
      (data?.products ?? []).map((product) => ({
        label: product.name,
        value: product.id,
      })),
    [data],
  )
}
