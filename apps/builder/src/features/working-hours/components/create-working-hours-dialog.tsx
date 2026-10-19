"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
import { Loader2Icon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { createWorkingHoursAction } from "../actions/create-working-hours.action"
import { workingHoursEditorHref } from "../lib/routes"
import { createWorkingHoursRequest } from "../schema/action"

export function CreateWorkingHoursDialog({
  workspaceId,
}: {
  workspaceId: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createWorkingHoursAction.bind(null, workspaceId),
      zodResolver(createWorkingHoursRequest),
      {
        actionProps: {
          onSuccess: ({ data }) => {
            toast.success(
              t("messages.createdSuccess", {
                feature: t("workingHours.label"),
              }),
            )
            setOpen(false)
            resetFormAndAction()
            if (data) {
              router.push(workingHoursEditorHref(workspaceId, data.id))
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
          // Validate on submit (then on change) so no error shows on open;
          // Continue is disabled while the name is empty instead.
          mode: "onSubmit",
          reValidateMode: "onChange",
          defaultValues: { name: "" },
        },
        errorMapProps: {},
      },
    )

  const name = useWatch({ control: form.control, name: "name" })
  const canSubmit = Boolean(name?.trim()) && !form.formState.isSubmitting

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm">
            <PlusIcon />
            {t("actions.add")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("workingHours.create.title")}</DialogTitle>
          <DialogDescription>
            {t("workingHours.create.description")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={t("fields.name.label")} name="name" required />
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="outline">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button disabled={!canSubmit} type="submit">
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.continue")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
