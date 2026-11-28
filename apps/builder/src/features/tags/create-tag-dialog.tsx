"use client"

import { rootFolderId } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { TAG_PRESET_COLORS } from "@chatbotx.io/utils/color"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useInvalidateTags } from "@/features/tags/provider/tag-hook"
import { createTagAction } from "./actions/create-tag-action"
import { createTagRequest } from "./schema/action"
import { TagColorField } from "./tag-color-field"
import {
  TAG_DIALOG_BODY_CLASS,
  TAG_DIALOG_CANCEL_CLASS,
  TAG_DIALOG_CONFIRM_CLASS,
  TAG_DIALOG_CONTENT_CLASS,
  TAG_DIALOG_FIELD_CLASS,
  TAG_DIALOG_FOOTER_CLASS,
  TAG_DIALOG_FORM_CLASS,
  TAG_DIALOG_HEADER_CLASS,
  TAG_DIALOG_INPUT_CLASS,
  TAG_DIALOG_TITLE_CLASS,
} from "./tag-dialog-styles"

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
  const invalidateTags = useInvalidateTags()

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
            invalidateTags()
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
            color: TAG_PRESET_COLORS[0],
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
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon />
            {t("messages.createFeature", { feature: t("fields.tag.label") })}
          </Button>
        }
      />
      <DialogContent className={TAG_DIALOG_CONTENT_CLASS}>
        <DialogHeader className={TAG_DIALOG_HEADER_CLASS}>
          <DialogTitle className={TAG_DIALOG_TITLE_CLASS}>
            {t("messages.createFeature", { feature: t("fields.tag.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <form
            className={TAG_DIALOG_FORM_CLASS}
            onSubmit={handleSubmitWithAction}
          >
            <div className={TAG_DIALOG_BODY_CLASS}>
              <InputField
                className={TAG_DIALOG_INPUT_CLASS}
                formItemClassName={TAG_DIALOG_FIELD_CLASS}
                label={t("fields.name.label")}
                name="name"
                required
              />
              <TagColorField />
            </div>

            <div className={TAG_DIALOG_FOOTER_CLASS}>
              <DialogClose
                render={
                  <Button
                    className={TAG_DIALOG_CANCEL_CLASS}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button
                className={TAG_DIALOG_CONFIRM_CLASS}
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
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
