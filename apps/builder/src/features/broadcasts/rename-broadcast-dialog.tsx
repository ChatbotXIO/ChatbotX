"use client"

import type { BroadcastModel } from "@aha.chat/database/types"
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
import { useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useEffect } from "react"
import { toast } from "sonner"
import { updateBroadcastAction } from "./actions/update-broadcast.action"
import { updateBroadcastSchema } from "./schemas/update-broadcast-schema"

export function RenameBroadcastDialog({
  broadcast,
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (val: boolean) => void
  broadcast: BroadcastModel | null
}) {
  const { t } = useTranslate()

  const {
    form,
    handleSubmitWithAction,
    resetFormAndAction,
    form: { setValue },
  } = useHookFormAction(
    updateBroadcastAction.bind(
      null,
      broadcast?.chatbotId ?? "",
      broadcast?.id ?? "",
    ),
    zodResolver(updateBroadcastSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("BroadcastModel update successfully")
          resetFormAndAction()
          onOpenChange(false)
        },
        onError: ({ error }) => {
          error.serverError && toast.error(error.serverError)
        },
      },
      formProps: {
        mode: "onChange",
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (broadcast) {
      setValue("name", broadcast.name)
    }
  }, [broadcast, setValue])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("broadcasts.update.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("broadcasts.name")} name="name" />

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button size="sm" type="button" variant="secondary">
                    Close
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
                  {t("common.confirm-btn")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
