import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { T } from "@tolgee/react"
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from "lucide-react"

type ChatbotMembersActionsProps = {
  onEdit: () => void
  onDelete: () => void
}

export function AgentActionsDropdown({
  onEdit,
  onDelete,
}: ChatbotMembersActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon className="mr-2 h-4 w-4" />
          <T keyName="common.edit" />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete}>
          <TrashIcon className="mr-2 h-4 w-4" />
          <T keyName="common.delete" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
