"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import type { LifecycleStageModel } from "@chatbotx.io/database/types"
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
import type { Column, ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { LifecycleStagePill } from "../lifecycle-stages/lifecycle-stage-pill"
import { getTagChipStyle } from "../tags/tag-colors"
import { getUserName } from "../users/schemas/resource"
import { ContactDetailDrawer } from "./components/contact-detail-drawer"
import { ContactListAction } from "./contacts-list-action"
import { CreateContactDialog } from "./create-contact-dialog"
import type { listContacts } from "./queries/list-contacts.queries"
import type { ListContactsItem } from "./schemas/query"
import type { ContactResource } from "./schemas/resource"
import { getAvatarInitials, getRespondAvatarUrl } from "./utils"

type ContactsTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listContacts>>]>
  lifecycleStages?: LifecycleStageModel[]
}

// Formato de data no padrão Respond.io ("abr 21, 2026 12:19 PM").
function formatRespondDate(
  value: Date | string | null,
  locale: string,
): string {
  if (!value) {
    return "—"
  }
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) {
    return "—"
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d)
}

// ISO 2-letter country code → bandeira emoji (regional indicator unicode).
function countryCodeToFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) {
    return "🌐"
  }
  const upper = code.toUpperCase()
  const base = 0x1_f1_e6
  return (
    String.fromCodePoint(base + upper.charCodeAt(0) - 65) +
    String.fromCodePoint(base + upper.charCodeAt(1) - 65)
  )
}

export function ContactsTable({
  workspaceId,
  promises,
  lifecycleStages: _lifecycleStages = [],
}: ContactsTableProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [{ data, pageCount }] = use(promises)
  // Drawer "Detalhes do contato" — abre ao clicar na linha. Pedro 2026-05-26:
  // pixel-perfect Respond.io (350px à direita).
  const [selectedContact, setSelectedContact] =
    useState<ListContactsItem | null>(null)

  const columns = useMemo<ColumnDef<ListContactsItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table: innerTable }) => (
          <Checkbox
            aria-label="Selecionar todos"
            checked={
              innerTable.getIsAllPageRowsSelected() ||
              (innerTable.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              innerTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Selecionar linha"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 32,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "keyword",
        accessorKey: "keyword",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => {
          const name =
            row.original.fullName ||
            row.original.phoneNumber ||
            row.original.email ||
            "?"
          const avatar = getRespondAvatarUrl(name)
          const initials = getAvatarInitials(name)
          return (
            <div className="flex items-center gap-2">
              {/* Avatar pixel-perfect Respond.io 2026-05-26 — span circular
                  28px com img de fundo (mesmo CDN visual). Não usa Avatar
                  shadcn porque ele força size-8 + rounded-lg + border que
                  conflitam com Respond.io. */}
              <span
                className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-[11px] text-white"
                style={{ backgroundColor: avatar.color }}
                title={name}
              >
                {/* biome-ignore lint/performance/noImgElement: avatar de fundo simples sem Next/Image */}
                <img
                  alt=""
                  aria-hidden
                  className="absolute inset-0 size-full object-cover"
                  height={28}
                  src={avatar.url}
                  width={28}
                />
                <span className="relative">{initials}</span>
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    className="max-w-[170px] truncate text-blue-500"
                    href={`/space/${workspaceId}/inbox?conversationId=${row.original.conversation?.id}`}
                    target="_blank"
                  >
                    {name}
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{name}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )
        },
        size: 220,
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.placeholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableHiding: false,
      },
      {
        id: "channels",
        accessorKey: "channels",
        header: ({ column }: { column: Column<ContactResource, unknown> }) => (
          <DataTableColumnHeader
            column={column}
            title={t("contacts.column.channels")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.contactInboxes?.map((contactInbox) => (
              <InboxIcon
                channel={contactInbox.channel as ChannelType}
                key={contactInbox.id}
                showLabel={false}
              />
            ))}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: "lifecycleStage",
        accessorKey: "lifecycleStage",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("lifecycle.title")} />
        ),
        cell: ({ row }) => {
          const stage = row.original.lifecycleStage
          if (!stage) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return <LifecycleStagePill stage={stage} />
        },
        enableSorting: false,
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
        cell: ({ row }) => {
          const email = row.original.email
          if (!email) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="max-w-[180px] truncate text-sm">{email}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{email}</p>
              </TooltipContent>
            </Tooltip>
          )
        },
        enableSorting: false,
      },
      {
        id: "phoneNumber",
        accessorKey: "phoneNumber",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.phoneNumber.label")}
          />
        ),
        cell: ({ row }) => {
          const phone = row.original.phoneNumber
          if (!phone) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return <span className="font-mono text-sm">{phone}</span>
        },
        enableSorting: false,
      },
      {
        id: "tags",
        accessorKey: "tags",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("tags.title")} />
        ),
        cell: ({ row }) => {
          const tags = row.original.tags ?? []
          if (tags.length === 0) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[11px] leading-4"
                  key={tag.id}
                  style={getTagChipStyle(tag.color)}
                >
                  {tag.emoji && <span aria-hidden>{tag.emoji}</span>}
                  <span className="max-w-[80px] truncate">{tag.name}</span>
                </span>
              ))}
              {tags.length > 3 && (
                <span className="text-muted-foreground text-xs">
                  +{tags.length - 3}
                </span>
              )}
            </div>
          )
        },
        enableSorting: false,
      },
      {
        id: "country",
        accessorKey: "country",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("contacts.column.country")}
          />
        ),
        cell: ({ row }) => {
          const country = row.original.country
          if (!country) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span aria-hidden className="text-base leading-none">
                {countryCodeToFlag(country)}
              </span>
              <span>{country}</span>
            </span>
          )
        },
        enableSorting: false,
      },
      {
        id: "locale",
        accessorKey: "locale",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("contacts.column.language")}
          />
        ),
        cell: ({ row }) => {
          const loc = row.original.locale
          if (!loc) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return <span className="text-sm">{loc}</span>
        },
        enableSorting: false,
      },
      {
        id: "conversationStatus",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("contacts.column.conversationStatus")}
          />
        ),
        cell: ({ row }) => {
          const conv = row.original.conversation
          if (!conv) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          const isOpen = !conv.archivedAt
          return (
            <span
              className={
                isOpen
                  ? "rounded px-1.5 py-0.5 font-medium text-[11px] text-emerald-600 dark:text-emerald-400"
                  : "rounded px-1.5 py-0.5 font-medium text-[11px] text-muted-foreground"
              }
            >
              {isOpen
                ? t("contacts.column.statusOpen")
                : t("contacts.column.statusClosed")}
            </span>
          )
        },
        enableSorting: false,
      },
      {
        id: "assignee",
        accessorKey: "assignee",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.assignee.label")}
          />
        ),
        cell: ({ row }) => {
          const name = getUserName(
            row.original.conversation?.assignedUser,
            t("assignAdmin.unAssigned"),
          )
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-[140px] truncate text-sm">{name}</div>
              </TooltipTrigger>
              <TooltipContent>{name}</TooltipContent>
            </Tooltip>
          )
        },
        meta: {
          label: t("fields.assignee.label"),
        },
        enableSorting: false,
      },
      {
        id: "lastMessage",
        accessorKey: "lastMessageAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("contacts.column.lastMessage")}
          />
        ),
        cell: ({ row }) => {
          const lastReadAt = row.original.conversation?.contactLastReadAt
          return (
            <span className="text-muted-foreground text-sm">
              {formatRespondDate(lastReadAt ?? null, locale)}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.addedAt.label")}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatRespondDate(row.original.createdAt, locale)}
          </span>
        ),
        meta: {
          label: t("fields.addedAt.label"),
        },
        enableSorting: true,
        enableHiding: false,
      },
    ],
    [workspaceId, t, locale],
  )

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

  return (
    <div className="flex h-full gap-0">
      <div className="flex-1 overflow-hidden">
        <DataTable
          onRowClick={(row) => setSelectedContact(row.original)}
          table={table}
        >
          <DataTableToolbar table={table}>
            <CreateContactDialog workspaceId={workspaceId} />
            <ContactListAction
              lifecycleStages={_lifecycleStages}
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>
      </div>
      <ContactDetailDrawer
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        open={selectedContact !== null}
        workspaceId={workspaceId}
      />
    </div>
  )
}
