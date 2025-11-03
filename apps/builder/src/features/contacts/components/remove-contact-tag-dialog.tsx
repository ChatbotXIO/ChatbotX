"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
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
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import type { TagCollection } from "@/features/tags/schemas"
import { callAPI } from "@/lib/swr"
import { removeContactTagAction } from "../actions/remove-contact-tag.action"
import { removeContactTagRequest } from "../schemas/remove-contact-tag.request"

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

  // Get tags list
  const { data: tagsData } = callAPI<TagCollection>(
    `/api/chatbots/${chatbotId}/tags?perPage=9999`,
  )
  const tagOptions = (tagsData?.data ?? []).map((v) => ({
    label: v.name,
    value: v.id,
  }))

  const { form, handleSubmitWithAction } = useHookFormAction(
    removeContactTagAction.bind(null, chatbotId),
    zodResolver(removeContactTagRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccessfully", {
              feature: t("fields.contact.label"),
            }),
          )
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
          tagId: "",
        },
      },
      errorMapProps: {},
    },
  )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>Add Tag</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col gap-2"
            onSubmit={handleSubmitWithAction}
          >
            <SelectField
              label={t("fields.tag.label")}
              name="tagId"
              options={tagOptions}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t("actions.cancel")}</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
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
