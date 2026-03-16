"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
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
import type { ListContactsItem } from "./schemas/query"

type ContactListActionProps = {
  chatbotId: string
  table: Table<ListContactsItem>
}

export function ContactListAction({
  chatbotId,
  table,
}: ContactListActionProps) {
  const t = useTranslations()
  const router = useRouter()

  const rows = table.getFilteredSelectedRowModel().rows

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <ListIcon />
          Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <AssignConversationDialog
          contactIds={rows.map((r) => r.id)}
          onSuccess={() => {
            router.refresh()
          }}
          trigger={
            <DropdownMenuItem
              disabled={rows.length === 0}
              onSelect={(e) => e.preventDefault()}
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
              disabled={rows.length === 0}
              onSelect={(e) => e.preventDefault()}
            >
              <TagIcon />
              {t("actions.addTag")}
            </DropdownMenuItem>
          }
        />

        <SequenceStoreProvider autoInitialize={true} chatbotId={chatbotId}>
          <AddContactSequenceDialog
            ids={rows.map((r) => r.id)}
            trigger={
              <DropdownMenuItem
                disabled={rows.length === 0}
                onSelect={(e) => e.preventDefault()}
              >
                <Layers2Icon />
                {t("actions.addSequence")}
              </DropdownMenuItem>
            }
          />
        </SequenceStoreProvider>

        <AddContactCustomFieldDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <DropdownMenuItem
              disabled={rows.length === 0}
              onSelect={(e) => e.preventDefault()}
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
              disabled={rows.length === 0}
              onSelect={(e) => e.preventDefault()}
            >
              <UserRoundXIcon className="text-destructive" />
              {t("actions.delete")}
            </DropdownMenuItem>
          }
        />

        <ExportContactDialog
          chatbotId={chatbotId}
          contactIds={rows.map((r) => r.id)}
          trigger={
            <DropdownMenuItem
              disabled={rows.length === 0}
              onSelect={(e) => e.preventDefault()}
            >
              <CloudDownloadIcon />
              {t("actions.export")}
            </DropdownMenuItem>
          }
        />

        <DropdownMenuItem
          onSelect={() => {
            router.push(`/chatbots/${chatbotId}/contacts/import`)
          }}
        >
          <CloudUploadIcon />
          {t("actions.import")}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ListIcon className="mr-2" size={16} />
            {t("actions.more")}
          </DropdownMenuSubTrigger>

          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <RemoveContactTagDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <DropdownMenuItem
                    disabled={rows.length === 0}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <OctagonXIcon />
                    {t("actions.removeTag")}
                  </DropdownMenuItem>
                }
              />

              <SequenceStoreProvider
                autoInitialize={true}
                chatbotId={chatbotId}
              >
                <RemoveContactSequenceDialog
                  ids={rows.map((r) => r.id)}
                  trigger={
                    <DropdownMenuItem
                      disabled={rows.length === 0}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Layers2Icon />
                      {t("actions.removeSequence")}
                    </DropdownMenuItem>
                  }
                />
              </SequenceStoreProvider>

              <ClearContactCustomFieldDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <DropdownMenuItem
                    disabled={rows.length === 0}
                    onSelect={(e) => e.preventDefault()}
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
                    disabled={rows.length === 0}
                    onSelect={(e) => e.preventDefault()}
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
                    .filter((v) => v) as string[]
                }
                trigger={
                  <DropdownMenuItem
                    disabled={rows.length === 0}
                    onSelect={(e) => e.preventDefault()}
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
                    .filter((v) => v) as string[]
                }
                trigger={
                  <DropdownMenuItem
                    disabled={rows.length === 0}
                    onSelect={(e) => e.preventDefault()}
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
