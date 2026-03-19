"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import {
  Loader2Icon,
  MessageSquareMoreIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { deleteSavedReplyAction } from "./actions/delete-saved-reply.action"
import type { SavedReplyItem } from "./provider/saved-reply-store"
import { useSavedReplyStore } from "./provider/saved-reply-store-context"
import { SavedReplyForm } from "./saved-reply-form"

type ViewState =
  | { type: "list" }
  | { type: "create" }
  | { type: "edit"; item: SavedReplyItem }

const SavedReplyManage = (props: { onSelect: (text: string) => void }) => {
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewState>({ type: "list" })
  const {
    savedReplies,
    isLoadingSavedReplies,
    getAllSavedReplies,
    deleteSavedReply: deleteSavedReplyFromStore,
  } = useSavedReplyStore((state) => state)

  const upsertSavedReply = useSavedReplyStore((state) => state.upsertSavedReply)

  const { executeAsync: deleteSavedReply, isPending: isDeletingSavedReply } =
    useAction(deleteSavedReplyAction, {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    })

  const editingSavedReply = useMemo(
    () => (view.type === "edit" ? view.item : null),
    [view],
  )

  const onSelectSavedReply = (item: SavedReplyItem) => {
    props.onSelect(item.text)
    setOpen(false)
    setView({ type: "list" })
  }

  const onDeleteSavedReply = async (id: string) => {
    await deleteSavedReply({ id })
    deleteSavedReplyFromStore(id)
    if (editingSavedReply?.id === id) {
      setView({ type: "list" })
    }
  }

  useEffect(() => {
    if (open) {
      getAllSavedReplies()
    }
  }, [open, getAllSavedReplies])

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="justify-start rounded-none" variant="ghost">
          <MessageSquareMoreIcon size={20} />
          {t("actions.insertSavedReplies")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-100 p-0">
        {view.type === "create" ? (
          <SavedReplyForm
            editingSavedReply={null}
            mode="create"
            onCancel={() => setView({ type: "list" })}
            onSaved={upsertSavedReply}
          />
        ) : null}
        {view.type === "edit" ? (
          <SavedReplyForm
            editingSavedReply={editingSavedReply}
            mode="edit"
            onCancel={() => setView({ type: "list" })}
            onSaved={upsertSavedReply}
          />
        ) : null}

        {view.type === "list" ? (
          <div>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold text-xl">
                {t("fields.savedReplies.label")}
              </h3>
              <Button
                onClick={() => setView({ type: "create" })}
                size="sm"
                type="button"
                variant="ghost"
              >
                <PlusIcon />
                {t("actions.addNew")}
              </Button>
            </div>

            <div className="max-h-75 overflow-y-auto">
              {isLoadingSavedReplies ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2Icon className="animate-spin" />
                </div>
              ) : null}

              {!isLoadingSavedReplies && savedReplies.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {t("messages.noDataAvailable")}
                </div>
              ) : null}

              {isLoadingSavedReplies
                ? null
                : savedReplies.map((item, index) => (
                    <Button
                      className={`flex h-auto w-full items-start justify-between gap-3 rounded-none border-b px-4 py-3 text-left hover:bg-accent ${index === savedReplies.length - 1 ? "border-b-0" : ""}`}
                      key={item.id}
                      onClick={() => onSelectSavedReply(item)}
                      type="button"
                      variant="ghost"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          /{item.shortcut}
                        </p>
                        <p className="wrap-break-word line-clamp-2 whitespace-normal text-muted-foreground text-sm">
                          {item.text}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          onClick={(event) => {
                            event.stopPropagation()
                            setView({ type: "edit", item })
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
                          onClick={(event) => {
                            event.stopPropagation()
                            onDeleteSavedReply(item.id)
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </Button>
                  ))}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export default SavedReplyManage
