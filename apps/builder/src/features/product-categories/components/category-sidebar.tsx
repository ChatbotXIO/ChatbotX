"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { EllipsisIcon, PencilIcon, TrashIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { flattenTree, groupByParent } from "../lib/category-tree"
import type { ProductCategoryResource } from "../schema/resource"
import { CategoryFormDialog } from "./category-form-dialog"
import { DeleteCategoryDialog } from "./delete-category-dialog"

export function CategorySidebar({
  workspaceId,
  categories,
}: {
  workspaceId: string
  categories: ProductCategoryResource[]
}) {
  const t = useTranslations("productCategories")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedCategoryId = searchParams.get("categoryId")
  const [editingCategory, setEditingCategory] =
    useState<ProductCategoryResource | null>(null)
  const [deletingCategory, setDeletingCategory] =
    useState<ProductCategoryResource | null>(null)

  // Every category is listed, sub-categories included: the sidebar is a filter,
  // not the place categories are organised.
  const visibleCategories = useMemo(() => flattenTree(categories), [categories])
  const childrenByParent = useMemo(
    () => groupByParent(categories),
    [categories],
  )

  const selectCategory = (categoryId?: string) => {
    const params = new URLSearchParams(searchParams)
    params.delete("page")
    if (categoryId) {
      params.set("categoryId", categoryId)
    } else {
      params.delete("categoryId")
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <aside className="w-64 shrink-0 border-e bg-card p-3">
      {/* No create button: categories are organised on their own tab, where the
          parent/child structure is actually visible. */}
      <div className="mb-2 px-2">
        <h2 className="font-semibold text-sm">{t("title")}</h2>
      </div>
      <Button
        className={cn(
          "mb-1 w-full justify-between",
          !selectedCategoryId && "bg-accent",
        )}
        onClick={() => selectCategory()}
        variant="ghost"
      >
        <span>{t("all")}</span>
      </Button>
      {visibleCategories.map((category) => (
        <div className="group flex items-center" key={category.id}>
          <Button
            className={cn(
              "min-w-0 flex-1 justify-between",
              category.parentId && "ps-6 text-muted-foreground",
              selectedCategoryId === category.id && "bg-accent",
            )}
            onClick={() => selectCategory(category.id)}
            variant="ghost"
          >
            <span className="truncate">{category.name}</span>
            <span className="text-muted-foreground text-xs">
              {category.productCount}
            </span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={t("actions")}
                  className="size-8 opacity-0 group-hover:opacity-100"
                  size="icon"
                  variant="ghost"
                >
                  <EllipsisIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingCategory(category)}>
                <PencilIcon />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeletingCategory(category)}
                variant="destructive"
              >
                <TrashIcon />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      {editingCategory ? (
        <CategoryFormDialog
          category={editingCategory}
          hideTrigger
          key={editingCategory.id}
          onOpenChange={(open) => {
            if (!open) {
              setEditingCategory(null)
            }
          }}
          open
          workspaceId={workspaceId}
        />
      ) : null}
      {deletingCategory ? (
        <DeleteCategoryDialog
          category={{
            ...deletingCategory,
            // Deleting a parent cascades to its sub-categories, so the warning
            // has to be here too — not only on the management tab.
            childCount: childrenByParent.get(deletingCategory.id)?.length ?? 0,
          }}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingCategory(null)
            }
          }}
          open
          workspaceId={workspaceId}
        />
      ) : null}
    </aside>
  )
}
