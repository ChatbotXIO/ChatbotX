"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { updateSequenceAction } from "./actions/update-sequence.action"
import type { SequenceResource } from "./schemas/get-sequences-schema"
import { updateSequenceSchema } from "./schemas/update-sequence-schema"

export function RenameSequenceDialog({
  sequence,
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  sequence: SequenceResource | null
  onSuccess?: () => void
}) {
  const t = useTranslations()

  const {
    form,
    handleSubmitWithAction,
    form: { setValue },
  } = useHookFormAction(
    updateSequenceAction.bind(
      null,
      sequence?.chatbotId ?? "",
      sequence?.id ?? "",
    ),
    zodResolver(updateSequenceSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.sequences.label"),
            }),
          )
          onOpenChange(false)
          onSuccess?.()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (sequence) {
      setValue("name", sequence.name)
    }
  }, [sequence, setValue])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.editFeature", {
              feature: t("fields.sequences.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("fields.name.label")} name="name" required />

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button size="sm" type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  className="ml-auto"
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
