"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { PencilIcon, Trash2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { deleteSavedReplyAction } from "./actions/delete-saved-reply.action"
import type { SavedReplyResource } from "./schema"

type SavedReplyItemProps = {
  chatbotId: string
  isLast: boolean
  item: SavedReplyResource
  onDeleteSuccess: (id: string) => void
  onEdit: (item: SavedReplyResource) => void
  onSelect: (item: SavedReplyResource) => void
}

export const SavedReplyItem = ({
  chatbotId,
  isLast,
  item,
  onDeleteSuccess,
  onEdit,
  onSelect,
}: SavedReplyItemProps) => {
  const { executeAsync: deleteSavedReply, isPending: isDeletingSavedReply } =
    useAction(deleteSavedReplyAction.bind(null, chatbotId, item.id), {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    })

  const onDelete = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    await deleteSavedReply()
    onDeleteSuccess(item.id)
  }

  return (
    <Button
      className={`flex h-auto w-full items-start justify-between gap-3 rounded-none border-b px-4 py-3 text-left hover:bg-accent ${isLast ? "border-b-0" : ""}`}
      onClick={() => onSelect(item)}
      type="button"
      variant="ghost"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold">/{item.shortcut}</p>
        <p className="wrap-break-word line-clamp-2 whitespace-normal text-muted-foreground text-sm">
          {item.text}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          onClick={(event) => {
            event.stopPropagation()
            onEdit(item)
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <PencilIcon />
        </Button>
        <Button
          className="text-destructive"
          disabled={isDeletingSavedReply}
          onClick={onDelete}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2Icon />
        </Button>
      </div>
    </Button>
  )
}
