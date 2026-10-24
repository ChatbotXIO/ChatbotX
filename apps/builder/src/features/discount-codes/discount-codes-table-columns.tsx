"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import type { ColumnDef, Row } from "@tanstack/react-table"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { setDiscountCodeActiveAction } from "./actions/discount-code.action"
import { formatDiscountValue } from "./lib/format-discount"
import type { DiscountCodeResource } from "./schema/public"

export type DiscountCodeRowAction = {
  row: Row<DiscountCodeResource>
  variant: "delete"
}

function ActiveToggleCell({
  workspaceId,
  discountCode,
  errorMessage,
}: {
  workspaceId: string
  discountCode: DiscountCodeResource
  errorMessage: string
}) {
  const router = useRouter()
  const { execute, isPending, input } = useAction(
    setDiscountCodeActiveAction.bind(null, workspaceId, discountCode.id),
    {
      onSuccess: () => router.refresh(),
      onError: toastActionError(errorMessage),
    },
  )
  // The saved state, except while a change is on its way (shown at once).
  const checked = isPending && input ? input.isActive : discountCode.isActive
  return (
    <Switch
      checked={checked}
      disabled={isPending}
      onCheckedChange={(value) => execute({ isActive: value })}
    />
  )
}

export const getDiscountCodeColumns = ({
  t,
  locale,
  workspaceId,
  formatAmount,
  setRowAction,
}: {
  t: ReturnType<typeof useTranslations>
  locale: string
  workspaceId: string
  formatAmount: (amount: number) => string
  setRowAction: (action: DiscountCodeRowAction | null) => void
}): ColumnDef<DiscountCodeResource>[] => {
  const editHref = (id: string) => `/space/${workspaceId}/discount-codes/${id}`
  return [
    {
      id: "code",
      accessorKey: "code",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("discountCodes.columns.name")}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Link
            className="font-medium font-mono hover:underline"
            href={editHref(row.original.id)}
          >
            {row.original.code}
          </Link>
          {row.original.autoApply ? (
            <Badge variant="secondary">{t("discountCodes.automatic")}</Badge>
          ) : null}
        </div>
      ),
      meta: {
        label: t("discountCodes.columns.name"),
        placeholder: t("discountCodes.searchPlaceholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "discount",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("discountCodes.columns.discount")}
        />
      ),
      cell: ({ row }) =>
        formatDiscountValue(row.original, formatAmount) ??
        t("discountCodes.discountTypes.freeShipping"),
      enableSorting: false,
    },
    {
      id: "used",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("discountCodes.columns.used")}
        />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.usageLimit === null
            ? row.original.usedCount
            : `${row.original.usedCount}/${row.original.usageLimit}`}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "endsAt",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("discountCodes.columns.end")}
        />
      ),
      cell: ({ row }) =>
        row.original.endsAt
          ? formatDate(row.original.endsAt, {
              locale,
              dateStyle: "medium",
              timeStyle: "short",
            })
          : t("discountCodes.never"),
      enableSorting: false,
    },
    {
      id: "isActive",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("discountCodes.columns.active")}
        />
      ),
      cell: ({ row }) => (
        <ActiveToggleCell
          discountCode={row.original}
          errorMessage={t("discountCodes.saveError")}
          key={`${row.original.id}-${row.original.isActive}`}
          workspaceId={workspaceId}
        />
      ),
      enableSorting: false,
    },
    {
      id: "actions",
      header: t("actions.actions"),
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
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              render={<Link href={editHref(row.original.id)} />}
            >
              <PencilIcon className="me-2 h-4 w-4" />
              {t("actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setRowAction({ row, variant: "delete" })}
            >
              <Trash2Icon className="me-2 h-4 w-4" />
              {t("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
