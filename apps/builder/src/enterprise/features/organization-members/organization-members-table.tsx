"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import type {
  ListOrganizationMemberItem,
  ListOrganizationMembersResponse,
} from "./schema"

type OrganizationMembersTableProps = {
  promises: Promise<[ListOrganizationMembersResponse]>
}

const getOrganizationMembersColumns = ({
  t,
}: {
  t: ReturnType<typeof useTranslations>
}): ColumnDef<ListOrganizationMemberItem>[] => {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          className="translate-y-0.5"
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(Boolean(value))
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          className="translate-y-0.5"
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        />
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.name.label")} />
      ),
      cell: ({ row }) => <div>{row.original.user.name}</div>,
      size: 300,
      meta: {
        label: t("fields.name.label"),
        placeholder: t("fields.name.placeholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      id: "email",
      accessorKey: "email",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.email.label")}
        />
      ),
      cell: ({ row }) => <div>{row.original.user.email}</div>,
      size: 300,
      meta: {
        label: t("fields.email.label"),
        placeholder: t("fields.email.placeholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      id: "role",
      accessorKey: "role",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.role.label")} />
      ),
      cell: ({ row }) => <div>{row.original.role}</div>,
      size: 300,
      meta: {
        label: t("fields.role.label"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: false,
    },
  ]
}

const OrganizationMembersTable = (props: OrganizationMembersTableProps) => {
  const [{ data, pageCount }] = use(props.promises)
  const t = useTranslations()

  const columns = useMemo(() => getOrganizationMembersColumns({ t }), [t])

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return <DataTable table={table} />
}

export default OrganizationMembersTable
