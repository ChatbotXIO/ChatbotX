"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisIcon,
  FolderIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { toTableRows } from "../lib/category-tree"
import type { ProductCategoryResource } from "../schema/resource"
import { CategoryFormDialog } from "./category-form-dialog"
import { DeleteCategoryDialog } from "./delete-category-dialog"

type ManageCategoriesProps = {
  workspaceId: string
  categories: ProductCategoryResource[]
}

/**
 * The two-level category tree as one expandable table. The whole tree arrives as
 * a flat list — small enough that paging it would cost more than it saves — so
 * every level is already on the client and expanding is a local state change
 * rather than navigation.
 *
 * Which rows are open is deliberately *not* in the URL: it is a transient view
 * preference, and putting it in `?parentId=` (as the previous drill-in did) made
 * a shared link carry someone else's scroll position rather than the page.
 */
export function ManageCategories({
  workspaceId,
  categories,
}: ManageCategoriesProps) {
  const t = useTranslations("productCategories")
  const [editing, setEditing] = useState<ProductCategoryResource | null>(null)
  const [deleting, setDeleting] = useState<ProductCategoryResource | null>(null)
  const [addingChildTo, setAddingChildTo] =
    useState<ProductCategoryResource | null>(null)
  // Open by default: the point of a single table is seeing the whole tree, and
  // a first visit that shows only parents is indistinguishable from a workspace
  // that has no sub-categories.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  // Tracking what is *closed* rather than what is open keeps a category created
  // after the first render visible: an unknown id is expanded, so a refreshed
  // list never hides rows the user just added.
  const expandedIds = useMemo(
    () =>
      new Set(
        categories.map(({ id }) => id).filter((id) => !collapsedIds.has(id)),
      ),
    [categories, collapsedIds],
  )
  const rows = useMemo(
    () => toTableRows(categories, expandedIds),
    [categories, expandedIds],
  )
  const childCountOf = (categoryId: string) =>
    rows.find(({ category }) => category.id === categoryId)?.childCount ?? 0

  const toggleExpanded = (categoryId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const startAddingChild = (category: ProductCategoryResource) => {
    // Opening the parent first, so the new sub-category is not created into a
    // collapsed row the user then has to go looking for.
    setCollapsedIds((current) => {
      const next = new Set(current)
      next.delete(category.id)
      return next
    })
    setAddingChildTo(category)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AppBreadcrumb items={[{ label: t("title") }]} />
        </div>
        <CategoryFormDialog
          parentCandidates={categories}
          parentId={null}
          workspaceId={workspaceId}
        />
      </div>

      {categories.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          {t("empty")}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead className="w-32 text-end">
                  {t("columns.products")}
                </TableHead>
                <TableHead className="w-32 text-end">
                  {t("columns.subcategories")}
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ category, depth, childCount }) => {
                const isExpanded = expandedIds.has(category.id)
                return (
                  <TableRow key={category.id}>
                    <TableCell>
                      <div
                        className={cn(
                          "flex items-center gap-2",
                          depth > 0 && "ps-8",
                        )}
                      >
                        {childCount > 0 ? (
                          <Button
                            aria-expanded={isExpanded}
                            aria-label={
                              isExpanded ? t("collapse") : t("expand")
                            }
                            className="size-6"
                            onClick={() => toggleExpanded(category.id)}
                            size="icon"
                            variant="ghost"
                          >
                            {isExpanded ? (
                              <ChevronDownIcon />
                            ) : (
                              <ChevronRightIcon className="rtl:rotate-180" />
                            )}
                          </Button>
                        ) : (
                          // A spacer rather than nothing: without it the folder
                          // icons of childless and expandable rows sit on
                          // different vertical lines.
                          <span aria-hidden className="size-6 shrink-0" />
                        )}
                        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{category.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {category.productCount}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground tabular-nums">
                      {/* A sub-category cannot have children of its own, so a
                          zero here would read as "none yet" rather than "not
                          possible". */}
                      {depth > 0 ? "—" : childCount}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              aria-label={t("actions")}
                              size="icon"
                              variant="ghost"
                            >
                              <EllipsisIcon />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setEditing(category)}
                          >
                            <PencilIcon />
                            {t("edit")}
                          </DropdownMenuItem>
                          {depth === 0 ? (
                            <DropdownMenuItem
                              onClick={() => startAddingChild(category)}
                            >
                              <PlusIcon />
                              {t("createSub")}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            onClick={() => setDeleting(category)}
                            variant="destructive"
                          >
                            <TrashIcon />
                            {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {addingChildTo ? (
        <CategoryFormDialog
          hideTrigger
          key={`new-child-${addingChildTo.id}`}
          onOpenChange={(open) => {
            if (!open) {
              setAddingChildTo(null)
            }
          }}
          open
          parentCandidates={categories}
          parentId={addingChildTo.id}
          workspaceId={workspaceId}
        />
      ) : null}
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
