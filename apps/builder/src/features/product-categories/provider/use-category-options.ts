"use client"

import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { client } from "@/lib/orpc/orpc"
import { groupByParent, rootsOf } from "../lib/category-tree"
import type { ProductCategoryResource } from "../schema/resource"

const toOption = (category: ProductCategoryResource) => ({
  label: category.name,
  value: category.id,
})

export const useCategoryOptions = (workspaceId: string) => {
  const t = useTranslations("productCategories")
  const [categories, setCategories] = useState<ProductCategoryResource[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    client.productCategoriesAPI
      .listProductCategoriesAPI({ workspaceId })
      .then((data) => {
        if (!cancelled) {
          setCategories(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategories([])
          toast.error(t("loadError"))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [t, workspaceId])

  // Only top-level rows: a sub-category is reachable through its parent, and
  // offering both in one list would make the two pickers contradict each other.
  const options = useMemo(() => rootsOf(categories).map(toOption), [categories])

  const childrenByParent = useMemo(
    () => groupByParent(categories),
    [categories],
  )
  const childOptionsOf = useMemo(
    () => (parentId: string | null | undefined) =>
      parentId ? (childrenByParent.get(parentId) ?? []).map(toOption) : [],
    [childrenByParent],
  )

  return { categories, options, childOptionsOf, isLoading }
}
