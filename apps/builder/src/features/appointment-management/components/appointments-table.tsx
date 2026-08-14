"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@chatbotx.io/ui/components/ui/tabs"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import type { listAppointments } from "../queries"
import type { AppointmentManagementTab } from "../schemas/query"
import {
  type AppointmentRowAction,
  getAppointmentColumns,
} from "./appointments-table-columns"
import { CancelAppointmentDialog } from "./cancel-appointment-dialog"
import { DeleteAppointmentDialog } from "./delete-appointment-dialog"

type Props = {
  workspaceId: string
  tab: AppointmentManagementTab
  promises: Promise<[Awaited<ReturnType<typeof listAppointments>>]>
}

function useTabHref() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (tab: AppointmentManagementTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    params.set("page", "1")
    return `${pathname}?${params.toString()}`
  }
}

export function AppointmentsTable({ workspaceId, tab, promises }: Props) {
  const t = useTranslations()
  const getTabHref = useTabHref()
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] = useState<AppointmentRowAction | null>(null)
  const columns = useMemo(() => getAppointmentColumns({ t, setRowAction }), [t])
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      columnPinning: { right: ["actions"] },
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="font-bold text-xl">
          {t("appointmentManagement.title")}
        </CardTitle>
        <Tabs value={tab}>
          <TabsList>
            <Link href={getTabHref("next")}>
              <TabsTrigger value="next">
                {t("appointmentManagement.tabs.next")}
              </TabsTrigger>
            </Link>
            <Link href={getTabHref("past")}>
              <TabsTrigger value="past">
                {t("appointmentManagement.tabs.past")}
              </TabsTrigger>
            </Link>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table} />
        </DataTable>
        <CancelAppointmentDialog
          appointment={rowAction?.row.original ?? null}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "cancel"}
          workspaceId={workspaceId}
        />
        <DeleteAppointmentDialog
          appointment={rowAction?.row.original ?? null}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "delete"}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
