"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
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
import { createSavedReplyAction } from "./actions/create-saved-reply.action"
import { deleteSavedReplyAction } from "./actions/delete-saved-reply.action"
import { editSavedReplyAction } from "./actions/edit-saved-reply.action"
import type { SavedReplyItem } from "./provider/saved-reply-store"
import {
  useSavedReplyStore,
  useSavedReplyStoreActions,
} from "./provider/saved-reply-store-provider"
import { createSavedReplyRequest } from "./schemas/create-saved-reply.schema"
import { editSavedReplyRequest } from "./schemas/edit-saved-reply.schema"

type ViewState =
  | { type: "list" }
  | { type: "create" }
  | { type: "edit"; item: SavedReplyItem }

const SavedReplyManage = (props: { onSelect: (message: string) => void }) => {
  const t = useTranslations()

  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewState>({ type: "list" })
  const savedReplies = useSavedReplyStore((state) => state.savedReplies)
  const isLoadingSavedReplies = useSavedReplyStore(
    (state) => state.isLoadingSavedReplies,
  )
  const removeSavedReplyFromStore = useSavedReplyStore(
    (state) => state.removeSavedReply,
  )
  const upsertSavedReply = useSavedReplyStore((state) => state.upsertSavedReply)
  const { refreshSavedReplies } = useSavedReplyStoreActions()

  const { executeAsync: removeSavedReply, isPending: isDeletingSavedReply } =
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

  useEffect(() => {
    if (!open) {
      return
    }

    refreshSavedReplies().catch(() => {
      return
    })
  }, [open, refreshSavedReplies])

  const {
    form: createForm,
    handleSubmitWithAction: handleCreate,
    resetFormAndAction: resetCreateForm,
  } = useHookFormAction(
    createSavedReplyAction,
    zodResolver(createSavedReplyRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (data) {
            upsertSavedReply(data)
          }

          toast.success(t("messages.savedSuccessfully"))
          setView({ type: "list" })
          resetCreateForm()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          shortcut: "",
          message: "",
        },
      },
      errorMapProps: {},
    },
  )

  const {
    form: editForm,
    handleSubmitWithAction: handleEdit,
    resetFormAndAction: resetEditForm,
  } = useHookFormAction(
    editSavedReplyAction.bind(null, editingSavedReply?.id ?? ""),
    zodResolver(editSavedReplyRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (data) {
            upsertSavedReply(data)
          }

          toast.success(t("messages.savedSuccessfully"))
          setView({ type: "list" })
          resetEditForm()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          shortcut: "",
          message: "",
        },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (!editingSavedReply) {
      return
    }

    editForm.reset({
      shortcut: editingSavedReply.shortcut,
      message: editingSavedReply.message,
    })
  }, [editForm, editingSavedReply])

  const onSelectSavedReply = (item: SavedReplyItem) => {
    props.onSelect(item.message)
    setOpen(false)
    setView({ type: "list" })
  }

  const onDeleteSavedReply = async (id: string) => {
    await removeSavedReply({ id })
    removeSavedReplyFromStore(id)
    if (editingSavedReply?.id === id) {
      setView({ type: "list" })
    }
  }

  const renderForm = (mode: "create" | "edit") => {
    const form = mode === "create" ? createForm : editForm
    const onSubmit = mode === "create" ? handleCreate : handleEdit

    return (
      <Form {...form}>
        <form className="space-y-4 p-4" onSubmit={onSubmit}>
          <InputField
            label={t("fields.shortcut.label")}
            name="shortcut"
            placeholder="/hello"
            required
          />

          <TextareaField
            label={t("fields.messages.label")}
            name="message"
            placeholder="..."
            required
          />

          <div className="flex items-center justify-between pt-2">
            <Button
              onClick={() => setView({ type: "list" })}
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={!form.formState.isValid || form.formState.isSubmitting}
              type="submit"
            >
              {form.formState.isSubmitting ? (
                <Loader2Icon className="animate-spin" />
              ) : null}
              {t("actions.save")}
            </Button>
          </div>
        </form>
      </Form>
    )
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="justify-start rounded-none" variant="ghost">
          <MessageSquareMoreIcon size={20} />
          {t("actions.insertSavedReplies")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-100 p-0">
        {view.type === "create" ? renderForm("create") : null}
        {view.type === "edit" ? renderForm("edit") : null}

        {view.type === "list" ? (
          <div>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold text-xl">
                {t("fields.savedReplies.label")}
              </h3>
              <Button
                onClick={() => {
                  resetCreateForm()
                  setView({ type: "create" })
                }}
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
                          {item.message}
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
                          disabled={isDeletingSavedReply}
                          onClick={(event) => {
                            event.stopPropagation()
                            onDeleteSavedReply(item.id).catch(() => {
                              return
                            })
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
