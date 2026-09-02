"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { CreateMinigameTypeDialog } from "./components/create-minigame-type-dialog"
import { DeleteMinigamesDialog } from "./delete-minigames"
import type { MinigameResource } from "./schema/resource"

type MinigamesTableToolbarActionsProps = {
  table: Table<MinigameResource>
  workspaceId: string
}

export function MinigamesTableToolbarActions({
  table,
  workspaceId,
}: MinigamesTableToolbarActionsProps) {
  const t = useTranslations()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-2">
        {table.getFilteredSelectedRowModel().rows.length > 0 ? (
          <DeleteMinigamesDialog
            minigames={table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)}
            onSuccess={() => table.toggleAllRowsSelected(false)}
            workspaceId={workspaceId}
          />
        ) : null}
      </div>

      <Button onClick={() => setCreateDialogOpen(true)} size="sm">
        <PlusIcon />
        {t("actions.createFeature", {
          feature: t("fields.minigame.label"),
        })}
      </Button>

      <CreateMinigameTypeDialog
        onOpenChange={setCreateDialogOpen}
        open={createDialogOpen}
        workspaceId={workspaceId}
      />
    </>
  )
}
