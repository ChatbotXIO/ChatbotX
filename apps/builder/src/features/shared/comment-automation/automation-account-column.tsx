"use client"

import type { CommentAutomationType } from "@chatbotx.io/database/partials"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslations } from "next-intl"
import { useAutomationAccounts } from "./automation-account-field"

function AutomationAccountCell({
  type,
  inboxId,
}: {
  type: CommentAutomationType
  inboxId: string | null
}) {
  const t = useTranslations()
  const { accounts, isLoading } = useAutomationAccounts(type)

  if (inboxId === null) {
    return (
      <span className="text-muted-foreground">
        {t("commentAutomation.account.all")}
      </span>
    )
  }
  if (isLoading) {
    return <span className="text-muted-foreground">—</span>
  }
  const account = accounts.find((item) => item.inboxId === inboxId)
  if (!account) {
    return (
      <span className="text-destructive">
        {t("commentAutomation.account.disconnected")}
      </span>
    )
  }
  return <span className="truncate">{account.name}</span>
}

/**
 * The "Account" column of every comment/story automation list. The name is
 * resolved from the same per-channel account query the form uses, so a list
 * of one channel costs one extra request however many rows it shows.
 */
export function buildAutomationAccountColumn<
  T extends { type: string; inboxId: string | null },
>({ title }: { title: string }): ColumnDef<T> {
  return {
    id: "account",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={title} />
    ),
    cell: ({ row }) => (
      <AutomationAccountCell
        inboxId={row.original.inboxId}
        type={row.original.type as CommentAutomationType}
      />
    ),
    size: 180,
    enableSorting: false,
  }
}
