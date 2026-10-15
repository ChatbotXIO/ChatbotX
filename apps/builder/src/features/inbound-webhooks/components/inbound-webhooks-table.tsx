"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  BarChart3Icon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import type { listInboundWebhooks } from "../queries"
import { CreateInboundWebhookDialog } from "./create-inbound-webhook-dialog"
import { DeleteInboundWebhookDialog } from "./delete-inbound-webhook-dialog"
import { InboundWebhookActiveSwitch } from "./inbound-webhook-active-switch"
import { InboundWebhookLinkDialog } from "./inbound-webhook-link-dialog"
import { RenameInboundWebhookDialog } from "./rename-inbound-webhook-dialog"

type InboundWebhookRow = Awaited<
  ReturnType<typeof listInboundWebhooks>
>["data"][number]

type RowAction = {
  row: InboundWebhookRow
  variant: "link" | "rename" | "delete"
}

type InboundWebhooksTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listInboundWebhooks>>]>
}

export const InboundWebhooksTable = ({
  workspaceId,
  promises,
}: InboundWebhooksTableProps) => {
  const t = useTranslations()
  const format = useFormatter()
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] = useState<RowAction | null>(null)

  const columns = useMemo<ColumnDef<InboundWebhookRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <Link
            className="inline-block max-w-[280px] truncate font-medium hover:underline"
            href={`/space/${workspaceId}/inbound-webhooks/${row.original.id}`}
          >
            {row.original.name}
          </Link>
        ),
        enableSorting: false,
      },
      {
        id: "active",
        accessorKey: "active",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("inboundWebhooks.columns.active")}
          />
        ),
        cell: ({ row }) => (
          <InboundWebhookActiveSwitch
            active={row.original.active}
            id={row.original.id}
            name={row.original.name}
            workspaceId={workspaceId}
          />
        ),
        enableSorting: false,
      },
      {
        id: "requestCount",
        accessorKey: "requestCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("inboundWebhooks.columns.requests")}
          />
        ),
        cell: ({ row }) => format.number(row.original.requestCount),
        enableSorting: false,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("inboundWebhooks.columns.createdAt")}
          />
        ),
        cell: ({ row }) =>
          format.dateTime(new Date(row.original.createdAt), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        enableSorting: false,
      },
      {
        id: "action",
        size: 10,
        header: () => null,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon" type="button" variant="ghost">
                  <MoreHorizontalIcon className="size-4" />
                  <span className="sr-only">{t("actions.openMenu")}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={
                  <Link
                    href={`/space/${workspaceId}/inbound-webhooks/${row.original.id}`}
                  />
                }
              >
                <SettingsIcon />
                {t("inboundWebhooks.configure")}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href={`/space/${workspaceId}/inbound-webhooks/${row.original.id}/analytics`}
                  />
                }
              >
                <BarChart3Icon />
                {t("inboundWebhooks.viewAnalytics")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setRowAction({ row: row.original, variant: "link" })
                }
              >
                <LinkIcon />
                {t("inboundWebhooks.getLink")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setRowAction({ row: row.original, variant: "rename" })
                }
              >
                <PencilIcon />
                {t("actions.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setRowAction({ row: row.original, variant: "delete" })
                }
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
    [t, format, workspaceId],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: { columnPinning: { right: ["action"] } },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  const closeRowAction = () => setRowAction(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("inboundWebhooks.title")}
        </CardTitle>
        <CardDescription>{t("inboundWebhooks.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <CreateInboundWebhookDialog workspaceId={workspaceId} />
          </DataTableToolbar>
        </DataTable>

        <InboundWebhookLinkDialog
          onOpenChange={closeRowAction}
          open={rowAction?.variant === "link"}
          webhook={rowAction?.variant === "link" ? rowAction.row : null}
          workspaceId={workspaceId}
        />
        <RenameInboundWebhookDialog
          onOpenChange={closeRowAction}
          open={rowAction?.variant === "rename"}
          webhook={rowAction?.variant === "rename" ? rowAction.row : null}
          workspaceId={workspaceId}
        />
        <DeleteInboundWebhookDialog
          onOpenChange={closeRowAction}
          open={rowAction?.variant === "delete"}
          webhook={rowAction?.variant === "delete" ? rowAction.row : null}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
