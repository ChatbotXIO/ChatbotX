import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ActionType } from "@/features/flows/react-flow/action-type"
import { useTranslate } from "@tolgee/react"
import { PlusIcon } from "lucide-react"
import { landingPageEditorMenus } from "./menu"
import RecursiveDropdownMenu from "./recursive-dropdown-menu"

export default function SendMessageEditorAction({
  onClick,
}: {
  onClick: (name: ActionType) => void
}) {
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
          data={landingPageEditorMenus}
          onClick={onClick}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
