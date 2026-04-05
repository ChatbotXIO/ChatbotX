"use client"

import { SelectTagsInputField } from "@chatbotx.io/ui/components/form/select-tags-input-field"
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
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactElement, useState } from "react"
import { toast } from "sonner"
import { useSequenceOptions } from "@/features/sequences/provider/sequence-hook"
import { useWorkspaceId } from "@/hooks/routing"
import { removeContactSequenceAction } from "../actions/remove-contact-sequence.action"
import { removeContactSequenceRequest } from "../schemas/contact-sequence"

type RemoveContactSequenceDialogProps = {
  trigger: ReactElement
  ids: string[]
}

export default function RemoveContactSequenceDialog({
  trigger,
  ids,
}: RemoveContactSequenceDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()

  const sequenceOptions = useSequenceOptions()
  const sequenceSelectOptions = sequenceOptions.map((sequence) => ({
    label: sequence.name,
    value: sequence.id,
  }))

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      removeContactSequenceAction.bind(null, workspaceId),
      zodResolver(removeContactSequenceRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.sequences.label"),
              }),
            )
            setOpen(false)
            resetFormAndAction()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(
                t("messages.error", {
                  feature: t("fields.sequences.label"),
                }),
              )
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            ids,
            sequences: [],
          },
        },
        errorMapProps: {},
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"flex h-96 max-h-screen max-w-xl flex-col"}>
        <DialogHeader>
          <DialogTitle>{t("actions.removeSequence")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-1 flex-col"
            onSubmit={handleSubmitWithAction}
          >
            <div className="flex-1 overflow-y-auto">
              <SelectTagsInputField
                name="sequences"
                options={sequenceSelectOptions}
                placeholder={t("fields.search.placeholder")}
              />
            </div>

            <DialogFooter className="mt-4">
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
