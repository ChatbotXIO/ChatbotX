import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { MenuIcon, ShoppingCartIcon, WorkflowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { SelectFlowDialog } from "@/features/flows/components/select-flow-dialog"
import SavedReplyManage from "@/features/saved-replies/saved-reply-manage"
import EmojiPicker from "./emoji-picker"

type InputMenuProps = {
  onSelectEmoji: (emoji: string) => void
  onSelectSavedReply: (message: string) => void
}

export const InputMenu = ({
  onSelectEmoji,
  onSelectSavedReply,
}: InputMenuProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="px-2" size="sm" type="button" variant="ghost">
          <MenuIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-55 p-0">
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
          <Button
            className="justify-start rounded-none"
            type="button"
            variant="ghost"
          >
            <ShoppingCartIcon size={20} />
            {t("actions.sendProduct")}
          </Button>
          <EmojiPicker
            label={t("actions.insertEmoji")}
            onSelectEmoji={onSelectEmoji}
          />
          <SavedReplyManage
            onSelect={(message) => {
              onSelectSavedReply(message)
              setOpen(false)
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
