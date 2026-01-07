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
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import "react-day-picker/style.css"
import { useRouter } from "next/navigation"
import { type ReactElement, useEffect, useState } from "react"
import { toast } from "sonner"
import { createTriggerAction } from "./actions/create-trigger-action"
import { createTriggerSchema } from "./schemas/create-trigger-schema"

export function CreateTriggerDialog({
  chatbotId,
  folderId,
  trigger,
}: {
  chatbotId: string
  folderId: string | null
  trigger: ReactElement
}) {
  const t = useTranslations()
  const router = useRouter()

  const [open, onOpenChange] = useState(false)
  const { form, handleSubmitWithAction } = useHookFormAction(
    createTriggerAction.bind(null, chatbotId),
    zodResolver(createTriggerSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("fields.trigger.label"),
            }),
          )

          onOpenChange(false)
          form.reset()
          router.refresh()
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
          name: "",
          folderId,
          conditions: [],
          actions: [],
        },
      },
      errorMapProps: {},
    },
  )

  const { setValue } = form

  useEffect(() => {
    setValue("folderId", folderId)
  }, [folderId, setValue])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>
            {t("messages.createFeature", {
              feature: t("fields.trigger.label"),
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
              <InputField label="Name" name="name" required />

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    {t("actions.cancel")}
                  </Button>
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
                  {t("actions.create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
