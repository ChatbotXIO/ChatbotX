"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FolderIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs"
import { useState } from "react"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import type { TemplateStoreScope } from "../schema"
import { moveTemplateStoreCategoryAction } from "../template-store.action"
import { useTemplateStoreOutcome } from "../use-template-store-outcome"
import { CategoryFormDialog } from "./category-form-dialog"
import { DeleteCategoryDialog } from "./delete-category-dialog"

type CategoryChipData = { id: string; name: string; templateCount: number }

type CategoryBarProps = {
  scope: TemplateStoreScope
  categories: CategoryChipData[]
  /** The category the list is filtered by, if any (the URL's, when it still exists). */
  activeCategoryId: string | undefined
}

type RowAction = { category: CategoryChipData; variant: "rename" | "delete" }

/**
 * The store's categories as a row of chips above the table, like the folder
 * bar elsewhere: the add button sits in the corner, every chip is shown, a
 * chip filters the list (click it again to clear) and its menu renames,
 * reorders or deletes it.
 */
export function CategoryBar({
  scope,
  categories,
  activeCategoryId,
}: CategoryBarProps) {
  const t = useTranslations()
  const handleOutcome = useTemplateStoreOutcome()
  const [, setQuery] = useQueryStates(
    { categoryId: parseAsString, page: parseAsInteger },
    { shallow: false, clearOnDefault: true },
  )
  const [rowAction, setRowAction] = useState<RowAction | null>(null)

  const move = useAction(moveTemplateStoreCategoryAction, {
    onSuccess: ({ data }) =>
      handleOutcome(data, { successMessage: t("templateStore.categoryMoved") }),
    onError: toastActionError(t("templateStore.saveError")),
  })

  const toggle = (categoryId: string) =>
    setQuery({
      categoryId: categoryId === activeCategoryId ? null : categoryId,
      page: null,
    })

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 border-b pb-4">
      <CategoryFormDialog scope={scope} />
      {categories.map((category, index) => {
        const isActive = category.id === activeCategoryId
        return (
          <div
            className={cn(
              "group flex h-9 w-50 items-center rounded-md border bg-background transition-colors hover:border-primary/60 hover:bg-accent/50",
              isActive && "border-primary bg-accent",
            )}
            key={category.id}
          >
            <button
              aria-pressed={isActive}
              className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md ps-2.5 pe-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => toggle(category.id)}
              title={category.name}
              type="button"
            >
              <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-start">
                {category.name}
              </span>
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {category.templateCount}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={t("actions.openMenu")}
                    className="me-0.5 size-6 p-0 text-muted-foreground hover:text-foreground"
                    variant="ghost"
                  >
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => setRowAction({ category, variant: "rename" })}
                >
                  <PencilIcon />
                  {t("actions.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === 0 || move.isPending}
                  onClick={() =>
                    move.execute({
                      scope,
                      categoryId: category.id,
                      direction: "up",
                    })
                  }
                >
                  <ArrowUpIcon />
                  {t("templateStore.moveUp")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === categories.length - 1 || move.isPending}
                  onClick={() =>
                    move.execute({
                      scope,
                      categoryId: category.id,
                      direction: "down",
                    })
                  }
                >
                  <ArrowDownIcon />
                  {t("templateStore.moveDown")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRowAction({ category, variant: "delete" })}
                  variant="destructive"
                >
                  <Trash2Icon />
                  {t("actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}

      {rowAction?.variant === "rename" ? (
        <CategoryFormDialog
          category={rowAction.category}
          key={rowAction.category.id}
          onOpenChange={(open) => !open && setRowAction(null)}
          open
          scope={scope}
        />
      ) : null}
      {rowAction?.variant === "delete" ? (
        <DeleteCategoryDialog
          category={rowAction.category}
          onOpenChange={(open) => !open && setRowAction(null)}
          scope={scope}
        />
      ) : null}
    </div>
  )
}
