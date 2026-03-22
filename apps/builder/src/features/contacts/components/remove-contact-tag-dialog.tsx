"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { TagsInputField } from "@aha.chat/ui/components/ui/muhammada86/tags-input-field"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import { useTagOptions } from "@/features/tags/provider/tag-hook"
import { removeContactTagAction } from "../actions/remove-contact-tag.action"
import { removeContactTagsRequest } from "../schemas/contact-tag"

type RemoveContactTagDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function RemoveContactTagDialog({
  trigger,
  ids,
}: RemoveContactTagDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { chatbotId } = useParams<{ chatbotId: string }>()
  const tagOptions = useTagOptions()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      removeContactTagAction.bind(null, chatbotId),
      zodResolver(removeContactTagsRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.contact.label"),
              }),
            )
            resetFormAndAction()
            setOpen(false)
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
            ids,
            tags: [],
          },
        },
        errorMapProps: {},
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"max-h-screen max-w-md"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.deleteFeature", { feature: t("fields.tag.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={handleSubmitWithAction}
          >
            <TagsInputField
              label={t("fields.tag.label")}
              name="tags"
              suggestions={tagOptions}
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
