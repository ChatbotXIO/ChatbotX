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
import { T } from "@tolgee/react"
import {
  ArchiveIcon,
  BotIcon,
  CloudDownloadIcon,
  CloudUploadIcon,
  ListIcon,
  MessageCirclePlusIcon,
  OctagonXIcon,
  SaveIcon,
  SaveOffIcon,
  TagIcon,
  UserIcon,
  UserRoundXIcon,
} from "lucide-react"
import ArchiveConversationDialog from "../conversations/components/archive-conversation"
import AssignConversationDialog from "../conversations/components/assign-conversation-dialog"
import DisableBotDialog from "../conversations/components/disable-bot-dialog"
import EnableBotDialog from "../conversations/components/enable-bot-dialog"
import AddContactTagDialog from "./components/add-contact-tag-dialog"
import ClearContactCustomFieldDialog from "./components/clear-contact-custom-field-dialog"
import DeleteContactDialog from "./components/remove-contact-dialog"
import RemoveContactTagDialog from "./components/remove-contact-tag-dialog"
import type { ContactResource } from "./schemas"

type ContactListActionProps = {
  chatbotId: string
  table: Table<ContactResource>
}

export function ContactListAction({ table }: ContactListActionProps) {
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
          trigger={
            <DropdownMenuItem
              disabled={rows.length === 0}
              onSelect={(e) => e.preventDefault()}
            >
              <MessageCirclePlusIcon />
              <T keyName={"contacts.actions.assign"} />
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
              <T keyName={"contacts.actions.addTag"} />
            </DropdownMenuItem>
          }
        />

        <DropdownMenuItem disabled={rows.length === 0}>
          <SaveIcon />
          <T keyName={"contacts.actions.setCustomField"} />
        </DropdownMenuItem>

        <DeleteContactDialog
          ids={rows.map((r) => r.id)}
          trigger={
            <DropdownMenuItem
              disabled={rows.length === 0}
              onSelect={(e) => e.preventDefault()}
            >
              <UserRoundXIcon className="text-destructive" />
              <T keyName={"contacts.actions.delete"} />
            </DropdownMenuItem>
          }
        />

        <DropdownMenuItem disabled={true}>
          <CloudDownloadIcon />
          <T keyName={"contacts.actions.export"} />
        </DropdownMenuItem>

        <DropdownMenuItem disabled={true}>
          <CloudUploadIcon />
          <T keyName={"contacts.actions.import"} />
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ListIcon size={16} />
            <T keyName={"contacts.actions.more"} />
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
                    <T keyName={"contacts.actions.removeTag"} />
                  </DropdownMenuItem>
                }
              />

              <ClearContactCustomFieldDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <DropdownMenuItem
                    disabled={rows.length === 0}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <SaveOffIcon />
                    <T keyName={"contacts.actions.clearCustomField"} />
                  </DropdownMenuItem>
                }
              />

              <DisableBotDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <DropdownMenuItem
                    disabled={rows.length === 0}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <UserIcon />
                    <T keyName={"contacts.actions.disableBot"} />
                  </DropdownMenuItem>
                }
              />

              <EnableBotDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <DropdownMenuItem
                    disabled={rows.length === 0}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <BotIcon />
                    <T keyName={"contacts.actions.enableBot"} />
                  </DropdownMenuItem>
                }
              />

              <ArchiveConversationDialog
                ids={rows.map((r) => r.id)}
                trigger={
                  <DropdownMenuItem
                    disabled={rows.length === 0}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <ArchiveIcon />
                    <T keyName={"contacts.actions.archiveConversation"} />
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
