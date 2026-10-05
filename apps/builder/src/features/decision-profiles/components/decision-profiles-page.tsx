"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import type { listDecisionConnections } from "@/features/decision-connections/queries/list-decision-connections.query"
import type { listDecisionProfiles } from "../queries/list-decision-profiles.query"
import type { DecisionProfileListItem } from "../schema/resource"
import {
  type DecisionProfileDataTableRowAction,
  getDecisionProfileColumns,
} from "./decision-profiles-table-columns"
import { DecisionProfilesTableToolbarActions } from "./decision-profiles-table-toolbar-actions"
import { DeleteDecisionProfilesDialog } from "./delete-decision-profiles-dialog"
import { ProfileEditor } from "./profile-editor"

type Props = {
  promises: Promise<
    [
      Awaited<ReturnType<typeof listDecisionConnections>>,
      Awaited<ReturnType<typeof listDecisionProfiles>>,
    ]
  >
  workspaceId: string
}

export function DecisionProfilesPage({ promises, workspaceId }: Props) {
  const [connections, { data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DecisionProfileDataTableRowAction | null>(null)
  const t = useTranslations()
  const columns = useMemo(
    () => getDecisionProfileColumns({ setRowAction, t, workspaceId }),
    [t, workspaceId],
  )
  const { table } = useDataTable({
    columns,
    data,
    pageCount,
    clearOnDefault: true,
    getRowId: (row: DecisionProfileListItem) => row.id,
    initialState: {
      columnPinning: { right: ["actions"] },
      sorting: [{ id: "name", desc: false }],
    },
    shallow: false,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("decision.profiles")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <DecisionProfilesTableToolbarActions
              connections={connections}
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>
        <ProfileEditor
          connections={connections}
          key={rowAction?.row.original.id ?? "new"}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "update"}
          profile={rowAction?.row.original}
          showTrigger={false}
        />
        <DeleteDecisionProfilesDialog
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => rowAction?.row.toggleSelected(false)}
          open={rowAction?.variant === "delete"}
          profiles={rowAction?.row.original ? [rowAction.row.original] : []}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
