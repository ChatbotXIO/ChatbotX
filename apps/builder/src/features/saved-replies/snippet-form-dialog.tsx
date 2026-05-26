"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { createSavedReplyAction } from "./actions/create-saved-reply.action"
import { editSavedReplyAction } from "./actions/edit-saved-reply.action"
import { createSavedReplyRequest } from "./schema/mutation"
import type { SavedReplyResource } from "./schema/resource"

type SnippetFormDialogProps = {
  workspaceId: string
  // Quando `snippet` está presente o dialog opera em modo edit; senão create.
  snippet?: SavedReplyResource | null
  open?: boolean
  onOpenChange?: (val: boolean) => void
}

export function SnippetFormDialog({
  workspaceId,
  snippet,
  open: controlledOpen,
  onOpenChange,
}: SnippetFormDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const isEdit = !!snippet
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const isControlled = controlledOpen !== undefined
  const showTrigger = !(isControlled || isEdit)

  const createForm = useHookFormAction(
    createSavedReplyAction.bind(null, workspaceId),
    zodResolver(createSavedReplyRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.createdSuccess", { feature: t("snippets.feature") }),
          )
          setOpen(false)
          createForm.resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }: { error: { serverError?: string } }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { shortcut: "", text: "" },
      },
      errorMapProps: {},
    },
  )

  const editForm = useHookFormAction(
    editSavedReplyAction.bind(null, workspaceId, snippet?.id ?? ""),
    zodResolver(createSavedReplyRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", { feature: t("snippets.feature") }),
          )
          setOpen(false)
          editForm.resetFormAndAction()
          router.refresh()
        },
        onError: ({ error }: { error: { serverError?: string } }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: { mode: "onChange" },
      errorMapProps: {},
    },
  )

  const { form, handleSubmitWithAction, resetFormAndAction } = isEdit
    ? editForm
    : createForm

  useEffect(() => {
    if (isEdit && snippet) {
      editForm.form.reset({ shortcut: snippet.shortcut, text: snippet.text })
    }
  }, [isEdit, snippet, editForm.form])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) {
        resetFormAndAction()
      }
    },
    [setOpen, resetFormAndAction],
  )

  const title = isEdit
    ? t("messages.editFeature", { feature: t("snippets.feature") })
    : t("snippets.createTitle")

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button size="sm">
            <PlusIcon />
            {t("snippets.addButton")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("snippets.formDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <FormField
              control={form.control}
              name="shortcut"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("snippets.nameLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("snippets.namePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("snippets.messageLabel")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("snippets.messagePlaceholder")}
                      rows={6}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {isEdit ? t("actions.confirm") : t("snippets.createConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
