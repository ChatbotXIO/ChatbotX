"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import type { Table } from "@tanstack/react-table"
import {
  ArchiveIcon,
  BotIcon,
  CloudDownloadIcon,
  CloudUploadIcon,
  Layers2Icon,
  ListIcon,
  MessageCirclePlusIcon,
  OctagonXIcon,
  SaveIcon,
  SaveOffIcon,
  TagIcon,
  UserIcon,
  UserRoundXIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import ArchiveConversationDialog from "../conversations/components/archive-conversation"
import AssignConversationDialog from "../conversations/components/assign-conversation-dialog"
import DisableBotDialog from "../conversations/components/disable-bot-dialog"
import EnableBotDialog from "../conversations/components/enable-bot-dialog"
import AddContactSequenceDialog from "./components/add-contact-sequence-dialog"
import AddContactTagDialog from "./components/add-contact-tag-dialog"
import AddContactCustomFieldDialog from "./components/add-custom-field-dialog"
import ClearContactCustomFieldDialog from "./components/delete-contact-custom-field"
import DeleteContactDialog from "./components/remove-contact-dialog"
import RemoveContactSequenceDialog from "./components/remove-contact-sequence-dialog"
import RemoveContactTagDialog from "./components/remove-contact-tag-dialog"
import { ExportContactDialog } from "./export-contact-dialog"
import type { ExportContactsFilter } from "./schemas/action"
import type { ContactResponse } from "./schemas/query"

type ContactListActionProps = {
  workspaceId: string
  table: Table<ContactResponse>
  filter?: ExportContactsFilter
}

export function ContactListAction({
  workspaceId,
  table,
  filter,
}: ContactListActionProps) {
  const t = useTranslations()
  const router = useRouter()

  const rows = table.getFilteredSelectedRowModel().rows
  const exportAll = table.getIsAllPageRowsSelected()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline">
            <ListIcon />
            Actions
          </Button>
        }
      />
      <DropdownMenuContent className="w-56">
        <AssignConversationDialog
          contactIds={rows.map((r) => r.id)}
          onSuccess={() => {
            router.refresh()
          }}
          trigger={
            <DropdownMenuItem
              closeOnClick={false}
              disabled={rows.length === 0}
              onClick={(e) => e.preventDefault()}
            >
              <MessageCirclePlusIcon />
              {t("actions.assign")}
            </DropdownMenuItem>
          }
        />

        <AddContactTagDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <DropdownMenuItem
              closeOnClick={false}
              disabled={rows.length === 0}
              onClick={(e) => e.preventDefault()}
            >
              <TagIcon />
              {t("actions.addTag")}
            </DropdownMenuItem>
          }
        />

        <AddContactSequenceDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <DropdownMenuItem
              closeOnClick={false}
              disabled={rows.length === 0}
              onClick={(e) => e.preventDefault()}
            >
              <Layers2Icon />
              {t("actions.addSequence")}
            </DropdownMenuItem>
          }
        />

        <AddContactCustomFieldDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <DropdownMenuItem
              closeOnClick={false}
              disabled={rows.length === 0}
              onClick={(e) => e.preventDefault()}
            >
              <SaveIcon />
              {t("actions.setCustomField")}
            </DropdownMenuItem>
          }
        />

        <DeleteContactDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <DropdownMenuItem
              closeOnClick={false}
              disabled={rows.length === 0}
              onClick={(e) => e.preventDefault()}
            >
              <UserRoundXIcon className="text-destructive" />
              {t("actions.delete")}
            </DropdownMenuItem>
          }
        />

        <ExportContactDialog
          contactIds={rows.map((r) => r.original.id)}
          exportAll={exportAll}
          filter={filter}
          trigger={
            <DropdownMenuItem
              closeOnClick={false}
              disabled={rows.length === 0}
              onClick={(e) => e.preventDefault()}
            >
              <CloudDownloadIcon />
              {t("actions.export")}
            </DropdownMenuItem>
          }
          workspaceId={workspaceId}
        />

        <DropdownMenuItem
          render={
            <Link href={`/space/${workspaceId}/contacts/import`}>
              <CloudUploadIcon />
              {t("actions.import")}
            </Link>
          }
        />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="px-3 py-2">
            <ListIcon />
            {t("actions.more")}
          </DropdownMenuSubTrigger>

          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56">
              <RemoveContactTagDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <DropdownMenuItem
                    closeOnClick={false}
                    disabled={rows.length === 0}
                    onClick={(e) => e.preventDefault()}
                  >
                    <OctagonXIcon />
                    {t("actions.removeTag")}
                  </DropdownMenuItem>
                }
              />

              <RemoveContactSequenceDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <DropdownMenuItem
                    closeOnClick={false}
                    disabled={rows.length === 0}
                    onClick={(e) => e.preventDefault()}
                  >
                    <Layers2Icon />
                    {t("actions.removeSequence")}
                  </DropdownMenuItem>
                }
              />

              <ClearContactCustomFieldDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <DropdownMenuItem
                    closeOnClick={false}
                    disabled={rows.length === 0}
                    onClick={(e) => e.preventDefault()}
                  >
                    <SaveOffIcon />
                    {t("actions.clearCustomField")}
                  </DropdownMenuItem>
                }
              />

              <DisableBotDialog
                ids={
                  rows
                    .map((r) => r.original.conversation?.id || null)
                    .filter(Boolean) as string[]
                }
                trigger={
                  <DropdownMenuItem
                    closeOnClick={false}
                    disabled={rows.length === 0}
                    onClick={(e) => e.preventDefault()}
                  >
                    <UserIcon />
                    {t("actions.disableBot")}
                  </DropdownMenuItem>
                }
              />

              <EnableBotDialog
                ids={
                  rows
                    .map((r) => r.original.conversation?.id || null)
                    .filter(Boolean) as string[]
                }
                trigger={
                  <DropdownMenuItem
                    closeOnClick={false}
                    disabled={rows.length === 0}
                    onClick={(e) => e.preventDefault()}
                  >
                    <BotIcon />
                    {t("actions.enableBot")}
                  </DropdownMenuItem>
                }
              />

              <ArchiveConversationDialog
                ids={
                  rows
                    .map((r) => r.original.conversation?.id || null)
                    .filter(Boolean) as string[]
                }
                trigger={
                  <DropdownMenuItem
                    closeOnClick={false}
                    disabled={rows.length === 0}
                    onClick={(e) => e.preventDefault()}
                  >
                    <ArchiveIcon />
                    {t("actions.archiveConversation")}
                  </DropdownMenuItem>
                }
              />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
