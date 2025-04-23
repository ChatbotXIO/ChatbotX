import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { T } from "@tolgee/react"
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from "lucide-react"

interface ChatbotMembersActionsProps {
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
          <PencilIcon className="w-4 h-4 mr-2" />
          <T keyName="common.edit" />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete}>
          <TrashIcon className="w-4 h-4 mr-2" />
          <T keyName="common.delete" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
