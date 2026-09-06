"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import type { ColumnDef } from "@tanstack/react-table"
import { EllipsisVerticalIcon, Loader, ScrollTextIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useAvatarUrl } from "@/features/contacts/utils"
import { findContactConversationAction } from "../actions/find-contact-conversation.action"
import { getMinigamePlaysAction } from "../actions/get-minigame-plays.action"
import type { listMinigameHistory } from "../queries"
import { MinigamePlayRecordDialog } from "./minigame-play-record-dialog"

type ListResult = Awaited<ReturnType<typeof listMinigameHistory>>
type PlayerRow = ListResult["data"][number]
type Plays = NonNullable<
  Awaited<ReturnType<typeof getMinigamePlaysAction>>["data"]
>

type Props = {
  workspaceId: string
  minigameId: string
  promises: Promise<[ListResult]>
}

function PlayerNameCell({
  contact,
  contactId,
  contactInboxId,
  unknownContactLabel,
  conversationNotFoundLabel,
  popupBlockedLabel,
  workspaceId,
}: {
  contact: Pick<PlayerRow["contact"], "avatar" | "fullName">
  contactId: string
  contactInboxId: string | null
  unknownContactLabel: string
  conversationNotFoundLabel: string
  popupBlockedLabel: string
  workspaceId: string
}) {
  const avatarUrl = useAvatarUrl(contact as Parameters<typeof useAvatarUrl>[0])
  const name = contact.fullName ?? unknownContactLabel
  const openedTabRef = useRef<Window | null>(null)
  // A stable, per-row window name: opening it again with the same name later
  // (in onSuccess) just navigates this already-open tab instead of creating a
  // new one, so it isn't subject to popup-blocker rules.
  const conversationTabName = `minigame-conversation-${contactId}`
  const boundFindContactConversationAction = useMemo(
    () => findContactConversationAction.bind(null, workspaceId),
    [workspaceId],
  )
  const { execute, isExecuting } = useAction(
    boundFindContactConversationAction,
    {
      onSuccess: ({ data }) => {
        if (data?.conversationId) {
          window.open(
            `/space/${workspaceId}/inbox?conversationId=${data.conversationId}`,
            conversationTabName,
          )
        } else {
          openedTabRef.current?.close()
          toast.info(conversationNotFoundLabel)
        }
      },
      onError: () => {
        openedTabRef.current?.close()
        toast.error(popupBlockedLabel)
      },
    },
  )

  return (
    <Button
      className="h-auto justify-start gap-2 px-2 py-1"
      disabled={isExecuting}
      onClick={() => {
        execute({ contactId, contactInboxId })
      }}
      variant="ghost"
    >
      <Avatar className="size-8">
        <AvatarImage alt={name} className="object-cover" src={avatarUrl} />
        <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <span className="font-medium">{name}</span>
      {isExecuting && (
        <Loader aria-hidden="true" className="size-4 animate-spin" />
      )}
    </Button>
  )
}

export function MinigameHistoryTable({
  workspaceId,
  minigameId,
  promises,
}: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const [{ data, pageCount }] = use(promises)
  const [record, setRecord] = useState<{
    contactName: string
    plays: Plays
  } | null>(null)
  const boundGetMinigamePlaysAction = useMemo(
    () => getMinigamePlaysAction.bind(null, workspaceId),
    [workspaceId],
  )
  const { execute: loadPlays } = useAction(boundGetMinigamePlaysAction, {
    onSuccess: ({ data: plays, input }) => {
      if (plays) {
        const player = data.find((row) => row.contactId === input.contactId)
        setRecord({
          contactName:
            player?.contact.fullName ?? t("minigames.history.unknownContact"),
          plays,
        })
      }
    },
  })
  const columns = useMemo<ColumnDef<PlayerRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.contact.fullName,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <PlayerNameCell
            contact={row.original.contact}
            contactId={row.original.contactId}
            contactInboxId={row.original.contactInboxId}
            conversationNotFoundLabel={t(
              "minigames.history.conversationNotFound",
            )}
            popupBlockedLabel={t("minigames.history.popupBlocked")}
            unknownContactLabel={t("minigames.history.unknownContact")}
            workspaceId={workspaceId}
          />
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
      },
      {
        id: "played",
        accessorKey: "played",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("minigames.history.played")}
          />
        ),
        cell: ({ row }) => row.original.played,
      },
      {
        id: "remaining",
        accessorKey: "remaining",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("minigames.history.remaining")}
          />
        ),
        cell: ({ row }) => row.original.remaining,
      },
      {
        id: "sharesCount",
        accessorKey: "sharesCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("minigames.history.shares")}
          />
        ),
        cell: ({ row }) => row.original.sharesCount,
      },
      {
        id: "openedAt",
        accessorKey: "openedAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("minigames.history.openedAt")}
          />
        ),
        cell: ({ row }) => formatDate(row.original.openedAt, { locale }),
      },
      {
        id: "lastPlayedAt",
        accessorKey: "lastPlayedAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("minigames.history.lastPlayedAt")}
          />
        ),
        cell: ({ row }) => formatDate(row.original.lastPlayedAt, { locale }),
      },
      {
        id: "actions",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("actions.actions")} />
        ),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={t("actions.openMenu")}
                  className="size-8 p-0"
                  variant="ghost"
                >
                  <EllipsisVerticalIcon className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  loadPlays({
                    minigameId,
                    contactId: row.original.contactId,
                  })
                }
              >
                <ScrollTextIcon />
                {t("minigames.history.record")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableColumnFilter: false,
      },
    ],
    [loadPlays, locale, minigameId, t, workspaceId],
  )
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    initialState: {
      columnPinning: { right: ["actions"] },
    },
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("minigames.history.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table} />
        </DataTable>
        <MinigamePlayRecordDialog
          contactName={record?.contactName ?? ""}
          onOpenChange={(open) => {
            if (!open) {
              setRecord(null)
            }
          }}
          open={Boolean(record)}
          plays={record?.plays ?? []}
        />
      </CardContent>
    </Card>
  )
}
