"use client"

import { rootFolderId } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { createTagAction } from "./actions/create-tag-action"
import { createTagRequest } from "./schema/action"

type CreateTagDialogProps = {
  workspaceId: string
  folderId: string | null
}

export const CreateTagDialog = ({
  workspaceId,
  folderId,
}: CreateTagDialogProps) => {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createTagAction.bind(null, workspaceId),
      zodResolver(createTagRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.createdSuccess", { feature: t("fields.tag.label") }),
            )
            setOpen(false)
            resetFormAndAction()
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
          defaultValues: {
            name: "",
            folderId: null,
            syncToMessenger: false,
          },
        },
        errorMapProps: {},
      },
    )

  const { setValue } = form

  useEffect(() => {
    if (folderId && folderId !== rootFolderId) {
      setValue("folderId", folderId)
    }
  }, [folderId, setValue])

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen)
      if (!isOpen) {
        resetFormAndAction()
      }
    },
    [resetFormAndAction],
  )

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t("messages.createFeature", { feature: t("fields.tag.label") })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen max-w-xl overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", { feature: t("fields.tag.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-6" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />

            <SwitchField
              label={t("fields.syncToMessenger.label")}
              name="syncToMessenger"
              required
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
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
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
