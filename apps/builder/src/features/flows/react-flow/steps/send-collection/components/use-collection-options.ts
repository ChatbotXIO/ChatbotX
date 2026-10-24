"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useCategoryOptions } from "@/features/product-categories/provider/use-category-options"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

/** Categories, sub-categories, vendors and products the collection picks from. */
export function useCollectionOptions() {
  const workspaceId = useWorkspaceId()
  const categories = useCategoryOptions(workspaceId)
  const formOptions = useQuery(
    orpc.productsAPI.listProductFormOptionsAPI.queryOptions({
      input: { workspaceId },
    }),
  )
  return useMemo(
    () => ({
      isLoading: categories.isLoading || formOptions.isLoading,
      categoryOptions: categories.options,
      subcategoryOptionsOf: categories.childOptionsOf,
      vendorOptions: (formOptions.data?.vendors ?? []).map((vendor) => ({
        value: vendor.id,
        label: vendor.name,
      })),
      productOptions: (formOptions.data?.products ?? []).map((product) => ({
        value: product.id,
        label: product.name,
      })),
      categoryName: (id: string | null) =>
        categories.categories.find((category) => category.id === id)?.name,
      vendorName: (id: string | null) =>
        formOptions.data?.vendors.find((vendor) => vendor.id === id)?.name,
    }),
    [categories, formOptions.data, formOptions.isLoading],
  )
}
