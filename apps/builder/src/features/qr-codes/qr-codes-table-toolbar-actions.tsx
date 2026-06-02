"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { DeleteQrCodesDialog } from "./delete-qr-codes"
import type { ListQrCodeItem } from "./schemas/query"

type QrCodesTableToolbarActionsProps = {
  table: Table<ListQrCodeItem>
  workspaceId: string
}

export function QrCodesTableToolbarActions({
  table,
  workspaceId,
}: QrCodesTableToolbarActionsProps) {
  const t = useTranslations()
  const router = useRouter()

  return (
    <>
      <div className="flex items-center gap-2">
        {table.getFilteredSelectedRowModel().rows.length > 0 ? (
          <DeleteQrCodesDialog
            onSuccess={() => table.toggleAllRowsSelected(false)}
            qrCodes={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
        ) : null}
      </div>

      <Button
        onClick={() => router.push(`/space/${workspaceId}/qr-codes/create`)}
        size="sm"
      >
        <PlusIcon />
        {t("actions.createFeature", { feature: t("fields.qrCode.label") })}
      </Button>
    </>
  )
}
