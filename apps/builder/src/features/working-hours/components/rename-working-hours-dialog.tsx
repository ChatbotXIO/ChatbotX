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
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { updateWorkingHoursAction } from "../actions/update-working-hours.action"
import { useInvalidateWorkingHoursOptions } from "../provider/working-hours-hook"
import { updateWorkingHoursRequest } from "../schema/action"
import type { WorkingHoursResource } from "../schema/resource"

export function RenameWorkingHoursDialog({
  open,
  onOpenChange,
  workspaceId,
  workingHours,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workingHours: WorkingHoursResource | null
}) {
  const t = useTranslations()
  const router = useRouter()
  const invalidateOptions = useInvalidateWorkingHoursOptions()

  const {
    form,
    handleSubmitWithAction,
    form: { reset },
  } = useHookFormAction(
    updateWorkingHoursAction.bind(null, workspaceId, workingHours?.id ?? ""),
    zodResolver(updateWorkingHoursRequest),
    {
      actionProps: {
        onSuccess: () => {
          invalidateOptions()
          toast.success(
            t("messages.updatedSuccess", { feature: t("workingHours.label") }),
          )
          onOpenChange(false)
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
        defaultValues: { name: workingHours?.name ?? "" },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (workingHours) {
      reset({ name: workingHours.name })
    }
  }, [workingHours, reset])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("actions.rename")}</DialogTitle>
          <DialogDescription />
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
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.update")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
