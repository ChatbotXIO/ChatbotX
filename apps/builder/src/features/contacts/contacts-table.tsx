"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { Column, ColumnDef, Row } from "@tanstack/react-table"
import { format, formatDistanceToNow } from "date-fns"
import { useSearchParams } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { use, useCallback, useEffect, useMemo, useState } from "react"
import {
  type ContactFilterCriteria,
  ContactListFilterButton,
  ContactListFilterPanel,
  EMPTY_CONTACT_FILTER,
  useContactFilterQueryState,
} from "@/features/contact-filter"
import { EMAIL_PHONE_RESTRICTED_FILTER_FIELDS } from "@/features/contact-filter/lib/restricted-fields"
import { orpc } from "@/lib/orpc/query"
import { getUserName } from "../users/schema/resource"
import { ContactNameCell } from "./components/contact-name-cell"
import { CONTACTS_DEFAULT_PER_PAGE } from "./constants"
import { ContactListAction } from "./contacts-list-action"
import type { listContacts } from "./queries/list-contacts.queries"
import type { ExportContactsFilter } from "./schema/action"
import type { ListContactsResponse } from "./schema/query"
import type { ContactResource } from "./schema/resource"
import { getLatestContactLastReadAt } from "./utils"

/**
 * One contact rendered as a card, for the narrow-viewport view of the table.
 *
 * Only the fields worth a phone's width survive: identity, who owns the
 * conversation, and when the contact arrived. Source and last-read stay in the
 * table, which takes over from `md` up. Every label is a key the table columns
 * already use, so the card adds no translation surface.
 */
function ContactCard({
  row,
  workspaceId,
}: {
  row: Row<ListContactsResponse["data"][number]>
  workspaceId: string
}) {
  const t = useTranslations()
  const contact = row.original

  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Checkbox
        aria-label={t("actions.selectRow")}
        checked={row.getIsSelected()}
        className="mt-1 shrink-0"
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <ContactNameCell contact={contact} workspaceId={workspaceId} />
        <dl className="flex flex-col gap-1 text-muted-foreground text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <dt>{t("fields.assignee.label")}</dt>
            <dd className="truncate text-foreground">
              {getUserName(
                contact.conversation?.assignedUser,
                t("assignAdmin.unAssigned"),
              )}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt>{t("fields.createdAt.label")}</dt>
            <dd className="text-foreground">
              {format(contact.createdAt, "yyyy/MM/dd")}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

const parseSortParam = (value: string | null) => {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (sort): sort is { id: string; desc: boolean } =>
        typeof sort?.id === "string" && typeof sort?.desc === "boolean",
    )
  } catch {
    return []
  }
}

type ContactsTableProps = {
  canViewEmailAndPhone?: boolean
  initialContactFilter?: ContactFilterCriteria
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listContacts>>]>
}

export function ContactsTable({
  canViewEmailAndPhone = true,
  initialContactFilter = EMPTY_CONTACT_FILTER,
  workspaceId,
  promises,
}: ContactsTableProps) {
  const t = useTranslations()
  const formatter = useFormatter()
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [initialResponse] = use(promises)
  const {
    filter: contactFilter,
    setFilter: setContactFilter,
    isActive: isContactFilterActive,
  } = useContactFilterQueryState({ initialFilter: initialContactFilter })
  const [optimisticContactFilter, setOptimisticContactFilter] =
    useState<ContactFilterCriteria>(contactFilter)
  const [showContactFilterPanel, setShowContactFilterPanel] = useState(
    isContactFilterActive,
  )
  const isOptimisticContactFilterActive =
    optimisticContactFilter.conditions.length > 0
  const excludedFilterFields = useMemo(
    () =>
      canViewEmailAndPhone ? [] : [...EMAIL_PHONE_RESTRICTED_FILTER_FIELDS],
    [canViewEmailAndPhone],
  )

  const keyword = useMemo(() => {
    const params = new URLSearchParams(searchParamsKey)
    return params.get("keyword") ?? undefined
  }, [searchParamsKey])

  const listContactsInput = useMemo(() => {
    const params = new URLSearchParams(searchParamsKey)
    return {
      workspaceId,
      page: Number(params.get("page") ?? "1"),
      perPage: Number(
        params.get("perPage") ?? String(CONTACTS_DEFAULT_PER_PAGE),
      ),
      sort: parseSortParam(params.get("sort")),
      keyword: params.get("keyword") ?? undefined,
      contactFilter: isContactFilterActive ? contactFilter : undefined,
    }
  }, [contactFilter, isContactFilterActive, searchParamsKey, workspaceId])

  // `initialData` seeds the very first render from the RSC-fetched
  // `promises` prop — the old `useEffect`+`didHydrateInitialDataRef` guard
  // existed only to skip re-fetching on mount for that same reason.
  // `placeholderData: keepPreviousData` keeps the previous page on screen
  // (rather than a blank/loading table) while a new page/filter/sort loads.
  const { data: contactsResponse } = useQuery(
    orpc.contactsAPIs.listContactsByPOSTAuthenticatedAPI.queryOptions({
      input: listContactsInput,
      initialData: initialResponse,
      placeholderData: keepPreviousData,
    }),
  )
  const tableData = contactsResponse.data
  const tablePageCount = contactsResponse.pageCount
  const tableTotalCount = contactsResponse.totalCount
  const tableTotalCountCapped = contactsResponse.totalCountCapped

  useEffect(() => {
    if (isContactFilterActive) {
      setShowContactFilterPanel(true)
    }
  }, [isContactFilterActive])

  useEffect(() => {
    setOptimisticContactFilter(contactFilter)
  }, [contactFilter])

  const exportFilter = useMemo<ExportContactsFilter>(
    () => ({
      keyword,
      contactFilter: isOptimisticContactFilterActive
        ? optimisticContactFilter
        : undefined,
    }),
    [keyword, isOptimisticContactFilterActive, optimisticContactFilter],
  )
  const totalCountDisplay = formatter.number(tableTotalCount)
  const totalCountLabel = tableTotalCountCapped
    ? t("contacts.countCapped", { count: totalCountDisplay })
    : t("contacts.countExact", { count: totalCountDisplay })

  const columns = useMemo<ColumnDef<ListContactsResponse["data"][number]>[]>(
    () => [
      {
        id: "select",
        header: ({ table: innerTable }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={innerTable.getIsAllPageRowsSelected()}
            indeterminate={innerTable.getIsSomePageRowsSelected()}
            onCheckedChange={(value) =>
              innerTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("actions.selectRow")}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 32,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "fullName",
        accessorKey: "fullName",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <ContactNameCell
            avatarClassName="size-9"
            channel={
              row.original.contactInboxes?.[0]?.channel as
                | ChannelType
                | undefined
            }
            contact={row.original}
            conversationId={row.original.conversation?.id}
            workspaceId={workspaceId}
          />
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.placeholder"),
          variant: "text",
          // The column id ("fullName") matches the DB column so sorting
          // works directly, but the filter must persist under the server's
          // "keyword" query param — it searches name, email, and phone, not
          // just fullName.
          filterKey: "keyword",
        },
        enableColumnFilter: true,
        enableHiding: false,
      },
      {
        accessorKey: "source",
        header: ({ column }: { column: Column<ContactResource, unknown> }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.source.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {[
              ...new Set(
                row.original.contactInboxes?.map(
                  (contactInbox) => contactInbox.source,
                ) ?? [],
              ),
            ].map((source) => {
              const labelKey = `condition.sources.${source}` as const
              return (
                <span key={source}>
                  {t.has(labelKey) ? t(labelKey) : source}
                </span>
              )
            })}
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        meta: {
          label: t("fields.source.label"),
        },
      },
      {
        accessorKey: "assignee",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.assignee.label")}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="inline-block max-w-[200px] truncate">
                  {getUserName(
                    row.original.conversation?.assignedUser,
                    t("assignAdmin.unAssigned"),
                  )}
                </div>
              }
            />
            <TooltipContent>
              {getUserName(
                row.original.conversation?.assignedUser,
                t("assignAdmin.unAssigned"),
              )}
            </TooltipContent>
          </Tooltip>
        ),
        meta: {
          label: t("fields.assignee.label"),
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "lastReadAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.lastRead.label")}
          />
        ),
        cell: ({ row }) => {
          const lastReadAt = getLatestContactLastReadAt(
            row.original.contactInboxes,
          )

          return (
            <div>
              {lastReadAt
                ? formatDistanceToNow(lastReadAt, { addSuffix: true })
                : null}
            </div>
          )
        },
        meta: {
          label: t("fields.lastRead.label"),
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd"),
        meta: {
          label: t("fields.createdAt.label"),
        },
        enableSorting: true,
        enableHiding: false,
      },
    ],
    [workspaceId, t],
  )

  const { table } = useDataTable({
    data: tableData,
    columns,
    pageCount: tablePageCount,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: CONTACTS_DEFAULT_PER_PAGE,
      },
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  const handleContactFilterChange = useCallback(
    (next: ContactFilterCriteria) => {
      table.setPageIndex(0)
      setOptimisticContactFilter(next)
      setContactFilter(next).catch(() => {
        setOptimisticContactFilter(contactFilter)
      })
    },
    [contactFilter, setContactFilter, table],
  )

  return (
    <DataTable
      className="[&_tbody_td]:py-3 [&_tbody_td]:text-[15px] [&_tbody_tr]:h-16"
      mobileCard={(row) => <ContactCard row={row} workspaceId={workspaceId} />}
      table={table}
    >
      {showContactFilterPanel && (
        <ContactListFilterPanel
          excludeFields={excludedFilterFields}
          filter={optimisticContactFilter}
          onFilterChange={handleContactFilterChange}
        />
      )}
      <DataTableToolbar table={table}>
        <span className="whitespace-nowrap text-muted-foreground text-sm">
          {totalCountLabel}
        </span>
        <ContactListFilterButton
          active={isOptimisticContactFilterActive}
          filter={optimisticContactFilter}
          onToggle={() => setShowContactFilterPanel((current) => !current)}
          open={showContactFilterPanel}
        />
        <ContactListAction
          filter={exportFilter}
          table={table}
          workspaceId={workspaceId}
        />
      </DataTableToolbar>
    </DataTable>
  )
}
