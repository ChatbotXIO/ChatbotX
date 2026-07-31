"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { Column, ColumnDef } from "@tanstack/react-table"
import { format, formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type ContactFilterCriteria,
  ContactListFilterButton,
  ContactListFilterPanel,
  EMPTY_CONTACT_FILTER,
  useContactFilterQueryState,
} from "@/features/contact-filter"
import { EMAIL_PHONE_RESTRICTED_FILTER_FIELDS } from "@/features/contact-filter/lib/restricted-fields"
import { client } from "@/lib/orpc/orpc"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { getUserName } from "../users/schemas/resource"
import { CONTACTS_DEFAULT_PER_PAGE } from "./constants"
import { ContactListAction } from "./contacts-list-action"
import type { listContacts } from "./queries/list-contacts.queries"
import type { ExportContactsFilter } from "./schemas/action"
import type { ListContactsResponse } from "./schemas/query"
import type { ContactResource } from "./schemas/resource"
import { getLatestContactLastReadAt, useAvatarUrl } from "./utils"

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

function NameCell({
  contact,
  workspaceId,
}: {
  contact: ListContactsResponse["data"][number]
  workspaceId: string
}) {
  const avatarUrl = useAvatarUrl(contact)
  const inboxHref = `/space/${workspaceId}/inbox?conversationId=${contact.conversation?.id}`
  const channel = contact.contactInboxes?.[0]?.channel as
    | ChannelType
    | undefined

  return (
    <div className="flex max-w-56 items-center gap-3">
      <Link href={inboxHref} target="_blank">
        <div className="relative">
          <Avatar className="size-9 shrink-0">
            <AvatarImage
              alt={contact.fullName ?? ""}
              className="object-cover"
              src={avatarUrl}
            />
            <AvatarFallback className="bg-gray-300 text-sm dark:bg-zinc-100 dark:text-zinc-800">
              {contact.fullName?.slice(0, 2) ?? "?"}
            </AvatarFallback>
          </Avatar>
          {channel && (
            <div className="absolute end-0 bottom-0 ltr:translate-x-1 rtl:-translate-x-1">
              <InboxIcon
                channel={channel}
                iconClassName="size-3"
                showLabel={false}
                size="small"
              />
            </div>
          )}
        </div>
      </Link>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              className="truncate font-medium leading-5"
              href={inboxHref}
              target="_blank"
            >
              {contact.fullName}
            </Link>
          }
        />
        <TooltipContent>
          <p>{contact.fullName}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
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
  const [
    {
      data: initialData,
      pageCount: initialPageCount,
      totalCount: initialTotalCount,
      totalCountCapped: initialTotalCountCapped,
    },
  ] = use(promises)
  const [tableData, setTableData] =
    useState<ListContactsResponse["data"]>(initialData)
  const [tablePageCount, setTablePageCount] = useState(initialPageCount)
  const [tableTotalCount, setTableTotalCount] = useState(initialTotalCount)
  const [tableTotalCountCapped, setTableTotalCountCapped] = useState(
    initialTotalCountCapped,
  )
  const didHydrateInitialDataRef = useRef(false)
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

  useEffect(() => {
    if (!didHydrateInitialDataRef.current) {
      didHydrateInitialDataRef.current = true
      return
    }

    let ignore = false
    const params = new URLSearchParams(searchParamsKey)

    client.contactsAPIs
      .listContactsByPOSTAuthenticatedAPI({
        workspaceId,
        page: Number(params.get("page") ?? "1"),
        perPage: Number(
          params.get("perPage") ?? String(CONTACTS_DEFAULT_PER_PAGE),
        ),
        sort: parseSortParam(params.get("sort")),
        keyword: params.get("keyword") ?? undefined,
        contactFilter: isContactFilterActive ? contactFilter : undefined,
      })
      .then((response) => {
        if (ignore) {
          return
        }

        setTableData(response.data)
        setTablePageCount(response.pageCount)
        setTableTotalCount(response.totalCount)
        setTableTotalCountCapped(response.totalCountCapped)
      })
      .catch(() => {
        if (ignore) {
          return
        }

        setTableData(initialData)
        setTablePageCount(initialPageCount)
        setTableTotalCount(initialTotalCount)
        setTableTotalCountCapped(initialTotalCountCapped)
      })

    return () => {
      ignore = true
    }
  }, [
    contactFilter,
    initialData,
    initialPageCount,
    initialTotalCount,
    initialTotalCountCapped,
    isContactFilterActive,
    searchParamsKey,
    workspaceId,
  ])

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
          <NameCell contact={row.original} workspaceId={workspaceId} />
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
