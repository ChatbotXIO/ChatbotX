"use client"

import type { TemplateStoreAdminListing } from "@chatbotx.io/business"
import type { TemplateStoreListingStatus } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { clampPageIndex } from "../lib/clamp-page-index"
import type { TemplateStoreScope } from "../schema"
import { removeTemplateStoreListingAction } from "../template-store.action"
import { useTemplateStoreOutcome } from "../use-template-store-outcome"
import { ListingFormDialog } from "./listing-form-dialog"

type BadgeVariant = "default" | "secondary" | "destructive"

/** How each status reads; `published` is the normal case and shows no badge. */
const STATUS_BADGE = {
  published: {
    variant: "default",
    labelKey: "templateStore.status.published",
  },
  templateUnavailable: {
    variant: "destructive",
    labelKey: "templateStore.status.templateUnavailable",
  },
  shareDisabled: {
    variant: "destructive",
    labelKey: "templateStore.status.shareDisabled",
  },
} as const satisfies Record<
  TemplateStoreListingStatus,
  { variant: BadgeVariant; labelKey: string }
>

const STATUS_FILTER_ORDER: TemplateStoreListingStatus[] = [
  "published",
  "shareDisabled",
  "templateUnavailable",
]

type RowAction = {
  listing: TemplateStoreAdminListing
  variant: "editCategories" | "remove"
}

type ApprovedTemplatesTableProps = {
  scope: TemplateStoreScope
  listings: TemplateStoreAdminListing[]
  pageCount: number
  /** The page and page size the server rendered `listings` for (1-based page). */
  renderedPage: number
  renderedPerPage: number
  categories: { id: string; name: string }[]
  /** A search or filter is set, so an empty table means "no match" rather than "no templates yet". */
  hasActiveFilters: boolean
}

export function ApprovedTemplatesTable({
  scope,
  listings,
  pageCount,
  renderedPage,
  renderedPerPage,
  categories,
  hasActiveFilters,
}: ApprovedTemplatesTableProps) {
  const t = useTranslations()
  const [rowAction, setRowAction] = useState<RowAction | null>(null)

  const columns = useMemo<ColumnDef<TemplateStoreAdminListing>[]>(
    () => [
      {
        // The accessor key lets the toolbar build the filter; the id keys its URL param.
        accessorKey: "name",
        id: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <span className="block max-w-[320px] truncate font-medium">
            {row.original.name}
          </span>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("templateStore.searchPlaceholder"),
          variant: "text",
          filterKey: "keyword",
        },
        enableColumnFilter: true,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "categories",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("templateStore.categories")}
          />
        ),
        cell: ({ row }) =>
          row.original.categories.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.categories.map((category) => (
                <Badge
                  className="max-w-[180px]"
                  key={category.id}
                  title={category.name}
                  variant="secondary"
                >
                  <span className="truncate">{category.name}</span>
                </Badge>
              ))}
            </div>
          ),
        enableSorting: false,
      },
      {
        id: "installs",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("templateStore.installs")}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.installCount}</span>
        ),
        enableSorting: false,
      },
      {
        id: "owner",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("templateStore.owner")}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <UserIcon className="h-4 w-4" />
                  <span className="sr-only">
                    {row.original.owner.workspaceName}
                  </span>
                </span>
              }
            />
            <TooltipContent>
              <div>{row.original.owner.workspaceName}</div>
              {row.original.publisherName ? (
                <div className="text-muted-foreground">
                  {row.original.publisherName}
                </div>
              ) : null}
            </TooltipContent>
          </Tooltip>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "status",
        id: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("templateStore.statusLabel")}
          />
        ),
        cell: ({ row }) => {
          if (row.original.status === "published") {
            return null
          }
          const badge = STATUS_BADGE[row.original.status]
          return <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
        },
        meta: {
          label: t("templateStore.statusLabel"),
          placeholder: t("templateStore.allStatuses"),
          variant: "select",
          options: STATUS_FILTER_ORDER.map((status) => ({
            label: t(STATUS_BADGE[status].labelKey),
            value: status,
          })),
          filterKey: "status",
        },
        enableColumnFilter: true,
        enableSorting: false,
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon" variant="ghost">
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">{t("actions.openMenu")}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem
                onClick={() =>
                  setRowAction({
                    listing: row.original,
                    variant: "editCategories",
                  })
                }
              >
                <PencilIcon className="me-2 h-4 w-4" />
                {t("templateStore.editCategories")}
              </DropdownMenuItem>
              {row.original.templatePageUrl ? (
                <DropdownMenuItem
                  render={
                    <Link
                      href={row.original.templatePageUrl}
                      rel="noreferrer"
                      target="_blank"
                    />
                  }
                >
                  <ExternalLinkIcon className="me-2 h-4 w-4" />
                  {t("templateStore.openTemplatePage")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="text-destructive"
                onClick={() =>
                  setRowAction({ listing: row.original, variant: "remove" })
                }
              >
                <Trash2Icon className="me-2 h-4 w-4" />
                {t("templateStore.remove")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        size: 40,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t],
  )

  const { table } = useDataTable({
    data: listings,
    columns,
    pageCount,
    initialState: { columnPinning: { right: ["actions"] } },
    getRowId: (row) => row.listingId,
    shallow: false,
    clearOnDefault: true,
  })

  // Removing the only row of the last page (or a stale `?page=`) would leave an
  // empty page past the end; step back to the last page that exists. Only the
  // page the server just rendered is judged: while another page or page size
  // loads, `pageCount` still describes the previous request.
  const { pageIndex, pageSize } = table.getState().pagination
  useEffect(() => {
    const isServerPage =
      pageIndex === renderedPage - 1 && pageSize === renderedPerPage
    if (!isServerPage) {
      return
    }
    const lastPageIndex = clampPageIndex(pageIndex, pageCount)
    if (lastPageIndex !== pageIndex) {
      table.setPageIndex(lastPageIndex)
    }
  }, [pageCount, pageIndex, pageSize, renderedPage, renderedPerPage, table])

  const editing =
    rowAction?.variant === "editCategories" ? rowAction.listing : null
  const removing = rowAction?.variant === "remove" ? rowAction.listing : null

  return (
    <>
      <DataTable
        labels={{
          noResults: t(
            hasActiveFilters
              ? "templateStore.noMatches"
              : "templateStore.emptyListings",
          ),
        }}
        table={table}
      >
        <DataTableToolbar table={table}>
          <ListingFormDialog categories={categories} scope={scope} />
        </DataTableToolbar>
      </DataTable>
      {editing ? (
        <ListingFormDialog
          categories={categories}
          key={editing.listingId}
          listing={{
            listingId: editing.listingId,
            templateId: editing.templateId,
            name: editing.name,
            categoryIds: editing.categories.map((category) => category.id),
          }}
          onOpenChange={(open) => !open && setRowAction(null)}
          open
          scope={scope}
        />
      ) : null}
      {removing ? (
        <RemoveListingDialog
          listing={removing}
          onOpenChange={(open) => !open && setRowAction(null)}
          scope={scope}
        />
      ) : null}
    </>
  )
}

function RemoveListingDialog({
  scope,
  listing,
  onOpenChange,
}: {
  scope: TemplateStoreScope
  listing: TemplateStoreAdminListing
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("templateStore")
  const tActions = useTranslations("actions")
  const handleOutcome = useTemplateStoreOutcome()
  const { execute, isPending } = useAction(removeTemplateStoreListingAction, {
    onSuccess: ({ data }) =>
      handleOutcome(data, {
        successMessage: t("removed"),
        onDone: () => onOpenChange(false),
      }),
    onError: toastActionError(t("removeError")),
  })

  return (
    <ConfirmDialog
      confirmLabel={tActions("delete")}
      description={t("removeDescription")}
      destructive
      isPending={isPending}
      onConfirm={() => execute({ scope, listingId: listing.listingId })}
      onOpenChange={onOpenChange}
      open
      title={t("removeTitle", { name: listing.name })}
    />
  )
}
