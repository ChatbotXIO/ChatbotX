"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  ChevronRightIcon,
  FolderIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { groupByParent, rootsOf } from "../lib/category-tree"
import type { ProductCategoryResource } from "../schema/resource"
import { CategoryFormDialog } from "./category-form-dialog"
import { DeleteCategoryDialog } from "./delete-category-dialog"

type ManageCategoriesProps = {
  workspaceId: string
  categories: ProductCategoryResource[]
}

/**
 * Folder-style management for the two-level category tree. The whole tree
 * arrives as one flat list — it is small enough that paging it would cost more
 * than it saves — and the level being shown is decided by `?parentId=`, so a
 * drilled-in view stays shareable and survives a refresh.
 */
export function ManageCategories({
  workspaceId,
  categories,
}: ManageCategoriesProps) {
  const t = useTranslations("productCategories")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [editing, setEditing] = useState<ProductCategoryResource | null>(null)
  const [deleting, setDeleting] = useState<ProductCategoryResource | null>(null)

  const childrenByParent = useMemo(
    () => groupByParent(categories),
    [categories],
  )

  // Falling back to the root rather than an empty screen: the parent may have
  // been deleted in another tab, and a stale id should not look like data loss.
  const parent =
    categories.find(
      (category) => category.id === searchParams.get("parentId"),
    ) ?? null
  const parentId = parent?.id ?? null
  const visible = parentId
    ? (childrenByParent.get(parentId) ?? [])
    : rootsOf(categories)
  const childCountOf = (categoryId: string) =>
    childrenByParent.get(categoryId)?.length ?? 0

  const openParent = (nextParentId: string | null) => {
    const params = new URLSearchParams(searchParams)
    if (nextParentId) {
      params.set("parentId", nextParentId)
    } else {
      params.delete("parentId")
    }
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AppBreadcrumb
            items={[
              {
                label: t("title"),
                element: (
                  <Button
                    className="p-0 hover:bg-transparent"
                    onClick={() => openParent(null)}
                    variant="ghost"
                  >
                    {t("title")}
                  </Button>
                ),
              },
              ...(parent
                ? [
                    {
                      label: parent.name,
                      element: (
                        <Button
                          className="p-0 hover:bg-transparent"
                          disabled
                          variant="ghost"
                        >
                          {parent.name}
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
        <CategoryFormDialog
          key={parentId ?? "root"}
          parentId={parentId}
          workspaceId={workspaceId}
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          {parentId ? t("emptySubcategories") : t("empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((category) => {
            const label = (
              <>
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {category.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("productCount", { count: category.productCount })}
                </span>
              </>
            )
            return (
              <div
                className="group flex items-center gap-1 rounded-lg border pr-2 hover:border-primary"
                key={category.id}
              >
                {/* Only a top-level category can be opened; rendering a
                    sub-category as a button would put an inert stop in the tab
                    order and promise a drill-in that does not exist. */}
                {parentId ? (
                  <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-sm">
                    {label}
                  </div>
                ) : (
                  <Button
                    className="min-w-0 flex-1 justify-start gap-3 px-4 hover:bg-transparent"
                    onClick={() => openParent(category.id)}
                    size="lg"
                    variant="ghost"
                  >
                    {label}
                    <ChevronRightIcon className="text-muted-foreground" />
                  </Button>
                )}
                <Button
                  aria-label={t("edit")}
                  onClick={() => setEditing(category)}
                  size="icon"
                  variant="ghost"
                >
                  <PencilIcon />
                </Button>
                <Button
                  aria-label={t("delete")}
                  onClick={() => setDeleting(category)}
                  size="icon"
                  variant="ghost"
                >
                  <TrashIcon />
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {editing ? (
        <CategoryFormDialog
          category={editing}
          hideTrigger
          key={editing.id}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null)
            }
          }}
          open
          workspaceId={workspaceId}
        />
      ) : null}
      {deleting ? (
        <DeleteCategoryDialog
          category={{ ...deleting, childCount: childCountOf(deleting.id) }}
          onOpenChange={(open) => {
            if (!open) {
              setDeleting(null)
            }
          }}
          open
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
