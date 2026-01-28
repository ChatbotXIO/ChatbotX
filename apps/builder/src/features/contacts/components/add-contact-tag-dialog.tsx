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
import { useTagStore } from "@/features/tags/provider/tag-store-context"
import { addContactTagAction } from "../actions/add-contact-tag.action"
import { addContactTagRequest } from "../schemas/contact-tag"

type AddContactTagDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function AddContactTagDialog({
  trigger,
  ids,
}: AddContactTagDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const tagOptions = useTagOptions()
  const { getAllActiveTags } = useTagStore((state) => state)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      addContactTagAction.bind(null, chatbotId),
      zodResolver(addContactTagRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.contact.label"),
              }),
            )
            getAllActiveTags()
            setOpen(false)
            resetFormAndAction()
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

      <DialogContent className={"flex max-h-screen max-w-xl flex-col"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.addFeature", { feature: t("fields.tag.label") })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-1 flex-col space-y-4"
            onSubmit={handleSubmitWithAction}
          >
            <TagsInputField
              label={t("fields.tag.label")}
              name="tags"
              suggestions={tagOptions}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" variant="ghost">
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
