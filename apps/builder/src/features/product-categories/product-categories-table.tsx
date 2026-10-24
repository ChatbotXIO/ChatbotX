"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { ChevronLeftIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CategoryFormDialog } from "./components/category-form-dialog"
import { DeleteCategoryDialog } from "./components/delete-category-dialog"
import {
  type CategoryRow,
  type CategoryRowAction,
  getProductCategoryColumns,
} from "./product-categories-table-columns"

type ProductCategoriesTableProps = {
  workspaceId: string
  categories: { data: CategoryRow[]; pageCount: number }
  /** Set when the table lists this category's sub-categories. */
  parent: { id: string; name: string } | null
}

export function ProductCategoriesTable({
  workspaceId,
  categories,
  parent,
}: ProductCategoriesTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const [rowAction, setRowAction] = useState<CategoryRowAction | null>(null)
  const basePath = `/space/${workspaceId}/product-categories`

  const columns = useMemo(
    () =>
      getProductCategoryColumns({
        t,
        workspaceId,
        isSubcategoryLevel: parent !== null,
        setRowAction,
        onOpenSubcategories: (category) =>
          router.push(`${basePath}?parentId=${category.id}`),
        onCopyId: (category) => {
          navigator.clipboard
            .writeText(category.id)
            .then(() =>
              toast.success(
                t("productCategories.idCopied", { id: category.id }),
              ),
            )
            .catch(() => toast.error(t("productCategories.idCopyError")))
        },
      }),
    [t, workspaceId, parent, router, basePath],
  )

  const { table } = useDataTable({
    data: categories.data,
    columns,
    pageCount: categories.pageCount,
    initialState: { columnPinning: { right: ["actions"] } },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  const editing = rowAction?.variant === "edit" ? rowAction.row.original : null
  const deleting =
    rowAction?.variant === "delete" ? rowAction.row.original : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {parent
            ? t("productCategories.subcategoriesOf", { name: parent.name })
            : t("productCategories.title")}
        </CardTitle>
        <CardDescription>{t("productCategories.description")}</CardDescription>
        {parent ? (
          <CardAction>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={basePath}
            >
              <ChevronLeftIcon className="h-4 w-4 rtl:rotate-180" />
              {t("productCategories.back")}
            </Link>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <CategoryFormDialog
              key={parent?.id ?? "root"}
              parentId={parent?.id ?? null}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        {editing ? (
          <CategoryFormDialog
            category={editing}
            hideTrigger
            key={editing.id}
            onOpenChange={(open) => !open && setRowAction(null)}
            open
            workspaceId={workspaceId}
          />
        ) : null}
        {deleting ? (
          <DeleteCategoryDialog
            category={deleting}
            onOpenChange={(open) => !open && setRowAction(null)}
            open
            workspaceId={workspaceId}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
