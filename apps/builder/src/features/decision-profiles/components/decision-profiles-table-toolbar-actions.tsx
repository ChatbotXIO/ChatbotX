"use client"

import type { DecisionConnectionSafe } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import type { Table } from "@tanstack/react-table"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { DecisionProfileListItem } from "../schema/resource"
import { DeleteDecisionProfilesDialog } from "./delete-decision-profiles-dialog"
import { ProfileEditor } from "./profile-editor"

type Props = {
  connections: DecisionConnectionSafe[]
  table: Table<DecisionProfileListItem>
  workspaceId: string
}

export function DecisionProfilesTableToolbarActions({
  connections,
  table,
  workspaceId,
}: Props) {
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const t = useTranslations()
  const selectedRows = table.getFilteredSelectedRowModel().rows

  return (
    <div className="flex items-center gap-2">
      {selectedRows.length > 0 ? (
        <>
          <Button
            onClick={() => setBulkDeleteOpen(true)}
            size="sm"
            variant="outline"
          >
            <Trash2Icon aria-hidden="true" className="me-2 size-4" />
            {t("actions.delete")} ({selectedRows.length})
          </Button>
          <DeleteDecisionProfilesDialog
            onOpenChange={setBulkDeleteOpen}
            onSuccess={() => table.toggleAllRowsSelected(false)}
            open={bulkDeleteOpen}
            profiles={selectedRows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
        </>
      ) : null}
      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogTrigger
          render={
            <Button disabled={connections.length === 0} size="sm" type="button">
              <PlusIcon />
              {t("decision.addProfile")}
            </Button>
          }
        />
        <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("decision.addProfile")}</DialogTitle>
          </DialogHeader>
          <ProfileEditor
            connections={connections}
            onClose={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
