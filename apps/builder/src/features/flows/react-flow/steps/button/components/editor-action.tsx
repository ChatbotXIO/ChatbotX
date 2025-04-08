import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { actionsEditorMenus } from "@/features/flows/react-flow/nodes/send-message/menu"
import { useTranslate } from "@tolgee/react"
import { PlusIcon } from "lucide-react"
import type { StepType } from "../../step-action"
import RecursiveDropdownMenu from "../../../components/recursive-dropdown-menu"

export default function EditorAction({
  onClick,
}: {
  onClick: (name: StepType) => void
}) {
  const { t } = useTranslate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <PlusIcon />
          {t("common.actions")}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="overflow-auto max-h-[500px]">
        <RecursiveDropdownMenu data={actionsEditorMenus} onClick={onClick} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
