"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
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
import type { ColumnDef, Row } from "@tanstack/react-table"
import {
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  QrCodeIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { use, useMemo } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { CustomFieldStoreProvider } from "../custom-fields/provider/custom-field-store-context"
import { DeleteMagicLinksDialog } from "./delete-magic-links"
import { getMagicLinkPublicUrl } from "./helpers"
import { MagicLinkQrDialog } from "./magic-link-qr-dialog"
import { MagicLinksTableToolbarActions } from "./magic-links-table-toolbar-actions"
import type { ListMagicLinkItem, ListMagicLinksResponse } from "./schemas/query"
import { UpdateMagicLinkDialog } from "./update-magic-link"

type MagicLinksTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ListMagicLinksResponse>]>
}

type MagicLinkRowAction =
  | { row: Row<ListMagicLinkItem>; variant: "qr" }
  | { row: Row<ListMagicLinkItem>; variant: "update" }
  | { row: Row<ListMagicLinkItem>; variant: "delete" }

export const MagicLinksTable = ({
  workspaceId,
  promises,
}: MagicLinksTableProps) => {
  const t = useTranslations()
  const router = useRouter()
  const [, copy] = useCopyToClipboard()
  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] = React.useState<MagicLinkRowAction | null>(
    null,
  )

  const columns = useMemo<ColumnDef<ListMagicLinkItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table: tableData }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={
              tableData.getIsAllPageRowsSelected() ||
              (tableData.getIsSomePageRowsSelected() && "indeterminate")
            }
            className="translate-y-0.5"
            onCheckedChange={(value) =>
              tableData.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("actions.selectRow")}
            checked={row.getIsSelected()}
            className="translate-y-0.5"
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 20,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "keyword",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[200px] truncate">{row.original.name}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.name}</p>
            </TooltipContent>
          </Tooltip>
        ),
        meta: {
          label: t("fields.keywords.label"),
          placeholder: t("fields.keyword.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
      },
      {
        id: "url",
        accessorKey: "url",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.url.label")}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[240px] truncate font-mono text-xs">
                {row.original.url}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-md break-all">
              <p>{row.original.url}</p>
            </TooltipContent>
          </Tooltip>
        ),
        enableSorting: false,
      },
      {
        id: "action",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" type="button" variant="ghost">
                <MoreHorizontalIcon className="h-4 w-4" />
                <span className="sr-only">{t("actions.openMenu")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  const url = getMagicLinkPublicUrl(
                    workspaceId,
                    row.original.name,
                  )
                  copy(url).then(() => {
                    toast.success(t("messages.copiedToClipboard"))
                  })
                }}
              >
                <LinkIcon />
                {t("actions.copyUrl")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "qr" })}
              >
                <QrCodeIcon />
                {t("actions.qrCode")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "update" })}
              >
                <PencilIcon />
                {t("actions.edit")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "delete" })}
                variant="destructive"
              >
                <Trash2Icon />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [copy, t, workspaceId],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["action"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  const qrPublicUrl = rowAction?.row.original
    ? getMagicLinkPublicUrl(workspaceId, rowAction.row.original.name)
    : null

  return (
    <CustomFieldStoreProvider workspaceId={workspaceId}>
      <Card>
        <CardHeader>
          <CardTitle className="font-bold text-xl">
            {t("magicLinks.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable table={table}>
            <DataTableToolbar table={table}>
              <MagicLinksTableToolbarActions
                table={table}
                workspaceId={workspaceId}
              />
            </DataTableToolbar>
          </DataTable>

          <MagicLinkQrDialog
            onOpenChange={() => setRowAction(null)}
            open={rowAction?.variant === "qr"}
            publicUrl={rowAction?.variant === "qr" ? qrPublicUrl : null}
          />

          <UpdateMagicLinkDialog
            magicLink={
              rowAction?.variant === "update" ? rowAction.row.original : null
            }
            onOpenChange={() => setRowAction(null)}
            open={rowAction?.variant === "update"}
            workspaceId={workspaceId}
          />

          <DeleteMagicLinksDialog
            magicLinks={rowAction?.row.original ? [rowAction.row.original] : []}
            onOpenChange={() => setRowAction(null)}
            onSuccess={() => {
              router.refresh()
            }}
            open={rowAction?.variant === "delete"}
            showTrigger={false}
            workspaceId={workspaceId}
          />
        </CardContent>
      </Card>
    </CustomFieldStoreProvider>
  )
}
