import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { MenuIcon, WorkflowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { SelectFlowDialog } from "@/features/flows/components/select-flow-dialog"
import SavedReplyManage from "@/features/saved-replies/saved-reply-manage"
import EmojiPicker from "./emoji-picker"

type InputMenuProps = {
  setContent: (text: string, insert?: boolean) => void
}

export const InputMenu = ({ setContent }: InputMenuProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button className="px-2" size="sm" type="button" variant="ghost">
          <MenuIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-55 p-0">
        <div className="flex flex-col gap-1">
          <SelectFlowDialog
            submitText={t("actions.send")}
            title={t("actions.sendFlow")}
          >
            <Button
              className="justify-start rounded-none"
              type="button"
              variant="ghost"
            >
              <WorkflowIcon size={20} />
              {t("actions.sendFlow")}
            </Button>
          </SelectFlowDialog>
          <EmojiPicker
            label={t("actions.insertEmoji")}
            onSelectEmoji={(emoji) => setContent(emoji, true)}
          />
          <SavedReplyManage
            onSelect={(message) => {
              setContent(message)
              setOpen(false)
            }}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
