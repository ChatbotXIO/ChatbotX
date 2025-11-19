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
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { createSpreadsheetAction } from "./actions/create-spreadsheet-action"
import { createSpreadsheetRequest } from "./schemas/create-spreadsheet.request"

export function CreateSpreadsheetDialog({
  chatbotId,
  triggerButton,
  onSuccess,
}: {
  chatbotId: string
  triggerButton?: ReactNode
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createSpreadsheetAction.bind(null, chatbotId),
      zodResolver(createSpreadsheetRequest),
      {
        actionProps: {
          onSuccess: () => {
            toast.success("Spreadsheet created successfully")

            setOpen(false)
            resetFormAndAction()

            if (onSuccess) {
              onSuccess()
            } else {
              router.refresh()
            }
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
            url: "",
          },
        },
        errorMapProps: {},
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {triggerButton ? (
          triggerButton
        ) : (
          <Button size="sm">
            <PlusIcon />
            {t("googleSheets.add.title")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("googleSheets.add.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("googleSheets.name")} name="name" />

              <InputField
                label={t("googleSheets.link")}
                name="url"
                placeholder="https://docs.google.com/spreadsheets/d/1WqW6HDKgHNGXtDmmq5mqx_iMda1bVjtKYjU23uRCFgE/edit"
              />

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="link">
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
