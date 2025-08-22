import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type ChatbotMembersActionsProps = {
  onEdit: () => void
  onDelete: () => void
}

export function AgentActionsDropdown({
  onEdit,
  onDelete,
}: ChatbotMembersActionsProps) {
  const t = useTranslations()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon className="mr-2 h-4 w-4" />
          {t("actions.update")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete}>
          <TrashIcon className="mr-2 h-4 w-4" />
          {t("actions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
