"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
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
            <Button
              className="w-full justify-start"
              disabled={rows.length === 0}
              type="button"
              variant="ghost"
            >
              <MessageCirclePlusIcon />
              {t("actions.assign")}
            </Button>
          }
        />

        <AddContactTagDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <Button
              className="w-full justify-start"
              disabled={rows.length === 0}
              type="button"
              variant="ghost"
            >
              <TagIcon />
              {t("actions.addTag")}
            </Button>
          }
        />

        <AddContactSequenceDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <Button
              className="w-full justify-start"
              disabled={rows.length === 0}
              type="button"
              variant="ghost"
            >
              <Layers2Icon />
              {t("actions.addSequence")}
            </Button>
          }
        />

        <AddContactCustomFieldDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <Button
              className="w-full justify-start"
              disabled={rows.length === 0}
              type="button"
              variant="ghost"
            >
              <SaveIcon />
              {t("actions.setCustomField")}
            </Button>
          }
        />

        <DeleteContactDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <Button
              className="w-full justify-start"
              disabled={rows.length === 0}
              type="button"
              variant="ghost"
            >
              <UserRoundXIcon className="text-destructive" />
              {t("actions.delete")}
            </Button>
          }
        />

        <ExportContactDialog
          contactIds={rows.map((r) => r.original.id)}
          exportAll={exportAll}
          filter={filter}
          trigger={
            <Button
              className="w-full justify-start"
              disabled={rows.length === 0}
              type="button"
              variant="ghost"
            >
              <CloudDownloadIcon />
              {t("actions.export")}
            </Button>
          }
          workspaceId={workspaceId}
        />

        <Link
          className={buttonVariants({
            variant: "ghost",
            className: "w-full justify-start",
          })}
          href={`/space/${workspaceId}/contacts/import`}
        >
          <CloudUploadIcon />
          {t("actions.import")}
        </Link>

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
                  <Button
                    className="w-full justify-start"
                    disabled={rows.length === 0}
                    type="button"
                    variant="ghost"
                  >
                    <OctagonXIcon />
                    {t("actions.removeTag")}
                  </Button>
                }
              />

              <RemoveContactSequenceDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <Button
                    className="w-full justify-start"
                    disabled={rows.length === 0}
                    type="button"
                    variant="ghost"
                  >
                    <Layers2Icon />
                    {t("actions.removeSequence")}
                  </Button>
                }
              />

              <ClearContactCustomFieldDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <Button
                    className="w-full justify-start"
                    disabled={rows.length === 0}
                    type="button"
                    variant="ghost"
                  >
                    <SaveOffIcon />
                    {t("actions.clearCustomField")}
                  </Button>
                }
              />

              <DisableBotDialog
                ids={
                  rows
                    .map((r) => r.original.conversation?.id || null)
                    .filter(Boolean) as string[]
                }
                trigger={
                  <Button
                    className="w-full justify-start"
                    disabled={rows.length === 0}
                    type="button"
                    variant="ghost"
                  >
                    <UserIcon />
                    {t("actions.disableBot")}
                  </Button>
                }
              />

              <EnableBotDialog
                ids={
                  rows
                    .map((r) => r.original.conversation?.id || null)
                    .filter(Boolean) as string[]
                }
                trigger={
                  <Button
                    className="w-full justify-start"
                    disabled={rows.length === 0}
                    type="button"
                    variant="ghost"
                  >
                    <BotIcon />
                    {t("actions.enableBot")}
                  </Button>
                }
              />

              <ArchiveConversationDialog
                ids={
                  rows
                    .map((r) => r.original.conversation?.id || null)
                    .filter(Boolean) as string[]
                }
                trigger={
                  <Button
                    className="w-full justify-start"
                    disabled={rows.length === 0}
                    type="button"
                    variant="ghost"
                  >
                    <ArchiveIcon />
                    {t("actions.archiveConversation")}
                  </Button>
                }
              />
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
