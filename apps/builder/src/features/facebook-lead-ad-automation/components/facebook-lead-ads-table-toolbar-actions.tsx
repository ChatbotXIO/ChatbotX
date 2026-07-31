"use client"

import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ListFacebookLeadAdItem } from "../schemas/query"
import { DeleteFacebookLeadAdAutomationsDialog } from "./delete-facebook-lead-ad-automations"

type ToolbarActionsProps = {
  table: Table<ListFacebookLeadAdItem>
  workspaceId: string
}

export function FacebookLeadAdsTableToolbarActions({
  table,
  workspaceId,
}: ToolbarActionsProps) {
  const t = useTranslations()

  return (
    <>
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteFacebookLeadAdAutomationsDialog
          automations={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onSuccess={() => table.toggleAllRowsSelected(false)}
          workspaceId={workspaceId}
        />
      ) : null}

      <Link
        className={buttonVariants({ size: "sm" })}
        href={`/space/${workspaceId}/fb-lead-ads/create`}
      >
        <PlusIcon />
        {t("facebookLeadAdsAutomation.create")}
      </Link>
    </>
  )
}
