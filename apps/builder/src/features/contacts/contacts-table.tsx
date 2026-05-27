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
import { useChatStore } from "../chat/store/chat-store-provider"
import type { ListConversationItemResource } from "../conversations/schema/resource"
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
import { getAvatarInitials, getRespondAvatarUrl, useAvatarUrl } from "./utils"

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
  const prependConversation = useChatStore((s) => s.prependConversation)
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId)
  // Drawer "Detalhes do contato" — abre ao clicar na linha. Pedro 2026-05-26:
  // pixel-perfect Respond.io (350px à direita). Drawer reusa o
  // <ContactDetail> FULL do Inbox via ChatStoreProvider que mora no layout.
  const [selectedContact, setSelectedContact] =
    useState<ListContactsItem | null>(null)

  const handleRowClick = (contact: ListContactsItem) => {
    setSelectedContact(contact)
    if (contact.conversation) {
      // Popula chatStore com a conversation do contato pra que o
      // <ContactDetail> reuse a mesma fonte de verdade que usa no Inbox
      // (assignedUser etc vêm de useChatStore.conversations). O shape
      // do <ListContactsItem>.conversation tem subset do que
      // ListConversationItemResource precisa — fields extras (messages,
      // contactInboxes, unreadCount) não são lidos pelo ContactDetail,
      // então passamos defaults.
      const conversationForStore: ListConversationItemResource = {
        ...contact.conversation,
        contact,
        contactInboxes: contact.contactInboxes ?? [],
        messages: [],
        unreadCount: 0,
      } as unknown as ListConversationItemResource
      prependConversation(conversationForStore)
      setActiveConversationId(contact.conversation.id)
    }
  }

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
        cell: ({ row }) => (
          // Mesmo padrão do <ConversationItem> do Inbox (memory:
          // reference_avatares_consistentes). Seed do CDN = ID do contato
          // (snowflake imutável) — garante MESMO avatar em qualquer
          // lugar que renderiza (lista Inbox, topbar, bubble, drawer).
          <ContactNameCell contact={row.original} workspaceId={workspaceId} />
        ),
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
          // Pixel-perfect Respond.io 2026-05-26 (Pedro): tags em UMA linha
          // só (sem wrap). Máximo 3 chips visíveis com nome truncado +
          // "+N" pra restante. Row da tabela mantém altura fixa.
          const visible = tags.slice(0, 3)
          const remaining = tags.length - visible.length
          return (
            <div className="flex max-w-[260px] flex-nowrap items-center gap-1 overflow-hidden">
              {visible.map((tag) => (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[11px] leading-4"
                  key={tag.id}
                  style={getTagChipStyle(tag.color)}
                  title={tag.name}
                >
                  {tag.emoji && <span aria-hidden>{tag.emoji}</span>}
                  <span className="max-w-[70px] truncate">{tag.name}</span>
                </span>
              ))}
              {remaining > 0 && (
                <span className="shrink-0 text-muted-foreground text-xs">
                  +{remaining}
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

  // Pixel-perfect Respond.io 2026-05-26 (Pedro): drawer "Detalhes do
  // contato" SOBREPÕE a tabela (não empurra encolhendo). Wrapper
  // `relative` + drawer `absolute right-0 top-0 bottom-0 z-20` cobre o
  // espaço da tabela. Tabela mantém largura total.
  // Tipografia + separator pixel-perfect (memory:
  // reference_fontes_respond_io). Texto = Inter / 14px / weight 400 /
  // #CFD3D8 (text-text-secondary, NÃO branco puro). Separator entre rows =
  // `rgba(255,255,255,0.06)` (sutil), substitui `border-border` que ficava
  // forte demais no dark. Wrapper `[&_...]` targeta tbody/thead/td/th
  // sem mexer no shared Table.
  const tableClassName =
    "[&_tbody_tr]:!border-white/[0.06] [&_thead_tr]:!border-white/[0.06] [&_td]:!text-text-secondary [&_th]:!text-text-secondary [&_th]:!font-medium"

  return (
    <div className="relative h-full">
      <DataTable
        className={tableClassName}
        onRowClick={(row) => handleRowClick(row.original)}
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
      <ContactDetailDrawer
        contact={selectedContact}
        onClose={() => {
          setSelectedContact(null)
          setActiveConversationId(null)
        }}
        open={selectedContact !== null}
        workspaceId={workspaceId}
      />
    </div>
  )
}

// Cell da coluna Nome com avatar pixel-perfect Respond.io (Pedro 2026-05-26:
// "preciso que seja o mesmo do Inbox"). Usa o mesmo seed do
// <ConversationItem> — ID do contato — pra garantir mesma cor + bonequinho
// em qualquer lugar. `useAvatarUrl` retorna imagem própria do contato
// (additionalAttributes.avatarUrl) quando existe; senão cai no avatar do
// CDN local /respond-avatars (mesmo padrão do card do Inbox).
function ContactNameCell({
  contact,
  workspaceId,
}: {
  contact: ListContactsItem
  workspaceId: string
}) {
  const name = contact.fullName || contact.phoneNumber || contact.email || "?"
  const avatarUrl = useAvatarUrl(contact)
  const respondAvatar = getRespondAvatarUrl(contact.id ?? name)
  const finalAvatarUrl = avatarUrl || respondAvatar.url
  const initials = getAvatarInitials(name)
  return (
    <div className="flex items-center gap-2">
      <span
        className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full font-medium text-[11px] text-white"
        style={{ backgroundColor: respondAvatar.color }}
        title={name}
      >
        <span className="pointer-events-none">{initials}</span>
        {/* biome-ignore lint/performance/noImgElement: avatar de fundo simples sem Next/Image */}
        <img
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover"
          height={28}
          src={finalAvatarUrl}
          width={28}
        />
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            className="max-w-[170px] truncate text-blue-500"
            href={`/space/${workspaceId}/inbox?conversationId=${contact.conversation?.id}`}
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
}
