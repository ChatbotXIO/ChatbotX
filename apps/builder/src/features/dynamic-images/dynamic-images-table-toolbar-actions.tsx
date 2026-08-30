"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { DeleteDynamicImagesDialog } from "./delete-dynamic-images"
import type { DynamicImageResource } from "./schema/resource"

type DynamicImagesTableToolbarActionsProps = {
  table: Table<DynamicImageResource>
  workspaceId: string
}

export function DynamicImagesTableToolbarActions({
  table,
  workspaceId,
}: DynamicImagesTableToolbarActionsProps) {
  const t = useTranslations()
  const router = useRouter()

  return (
    <>
      <div className="flex items-center gap-2">
        {table.getFilteredSelectedRowModel().rows.length > 0 ? (
          <DeleteDynamicImagesDialog
            dynamicImages={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            onSuccess={() => table.toggleAllRowsSelected(false)}
            workspaceId={workspaceId}
          />
        ) : null}
      </div>

      <Button
        onClick={() =>
          router.push(`/space/${workspaceId}/dynamic-images/create`)
        }
        size="sm"
      >
        <PlusIcon />
        {t("actions.createFeature", {
          feature: t("fields.dynamicImage.label"),
        })}
      </Button>
    </>
  )
}
