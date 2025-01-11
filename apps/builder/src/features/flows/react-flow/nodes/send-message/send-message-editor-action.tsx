import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslate } from "@tolgee/react"
import { PlusIcon } from "lucide-react"
import type { ActionType } from "../../action-type"
import { sendMessageEditorMenus } from "./menu"
import RecursiveDropdownMenu from "./recursive-dropdown-menu"

export default function SendMessageEditorAction({
  onClick,
}: { onClick: (name: ActionType) => void }) {
  const { t } = useTranslate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <PlusIcon />
          {t("flows.sendMessageNodeEditor.addContent")}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56">
        <RecursiveDropdownMenu
          data={sendMessageEditorMenus}
          onClick={onClick}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
