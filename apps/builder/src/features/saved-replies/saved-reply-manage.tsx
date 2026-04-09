"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { Loader2Icon, MessageSquareMoreIcon, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { useSavedReplyStore } from "./provider/saved-reply-store-context"
import { SavedReplyCreateForm } from "./saved-reply-create-form"
import { SavedReplyEditForm } from "./saved-reply-edit-form"
import { SavedReplyItem } from "./saved-reply-item"
import type { SavedReplyResource } from "./schema/resource"

type ViewState =
  | { type: "list" }
  | { type: "create" }
  | { type: "edit"; item: SavedReplyResource }

const SavedReplyManage = (props: { onSelect: (text: string) => void }) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewState>({ type: "list" })
  const {
    savedReplies,
    isLoading: isLoadingSavedReplies,
    getAllSavedReplies,
    deleteSavedReply: deleteSavedReplyFromStore,
  } = useSavedReplyStore((state) => state)

  const upsertSavedReply = useSavedReplyStore((state) => state.upsertSavedReply)

  const editingSavedReply = useMemo(
    () => (view.type === "edit" ? view.item : null),
    [view],
  )

  const onSelectSavedReply = (item: SavedReplyResource) => {
    props.onSelect(item.text)
    setOpen(false)
    setView({ type: "list" })
  }

  const onDeleteSavedReply = (id: string) => {
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
        <Button variant="ghost">
          <MessageSquareMoreIcon size={20} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-100 p-0">
        {view.type === "create" ? (
          <SavedReplyCreateForm
            onCancel={() => setView({ type: "list" })}
            onSaved={upsertSavedReply}
            workspaceId={workspaceId}
          />
        ) : null}
        {view.type === "edit" && editingSavedReply ? (
          <SavedReplyEditForm
            editingSavedReply={editingSavedReply}
            onCancel={() => setView({ type: "list" })}
            onSaved={upsertSavedReply}
            workspaceId={workspaceId}
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
                    <SavedReplyItem
                      isLast={index === savedReplies.length - 1}
                      item={item}
                      key={item.id}
                      onDeleteSuccess={onDeleteSavedReply}
                      onEdit={(savedReply) =>
                        setView({ type: "edit", item: savedReply })
                      }
                      onSelect={onSelectSavedReply}
                      workspaceId={workspaceId}
                    />
                  ))}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export default SavedReplyManage
