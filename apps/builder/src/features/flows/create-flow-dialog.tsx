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
import { T, useTranslate } from "@tolgee/react"
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { createFlowAction } from "./actions/create-flow-action"
import { createFlowSchema } from "./schemas/create-flow-schema"

export function CreateFlowDialog({
  chatbotId,
  folderId,
}: {
  chatbotId: string
  folderId: string | null
}) {
  const { t } = useTranslate()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createFlowAction.bind(null, chatbotId),
      zodResolver(createFlowSchema),
      {
        actionProps: {
          onSuccess: () => {
            toast.success("Flow created successfully")

            setOpen(false)
            resetFormAndAction()
          },
          onError: ({ error }) => {
            error.serverError && toast.error(error.serverError)
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            name: "",
            folderId,
          },
        },
        errorMapProps: {},
      },
    )

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          <T keyName="flows.addBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("flows.create.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form
              className="flex-1 space-y-4"
              onSubmit={handleSubmitWithAction}
            >
              <InputField label={t("flows.name")} name="name" />

              <DialogFooter className="justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
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
