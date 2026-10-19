"use client"

import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
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
import { replaceWorkingHoursMembersAction } from "../actions/replace-working-hours-members.action"
import { setWorkingHoursMembersRequest } from "../schema/action"
import type { WorkingHoursResource } from "../schema/resource"

export type EmployeeOption = { value: string; label: string }

export function WorkingHoursEmployeesDialog({
  open,
  onOpenChange,
  workspaceId,
  workingHours,
  employees,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workingHours: WorkingHoursResource | null
  employees: EmployeeOption[]
}) {
  const t = useTranslations()
  const router = useRouter()

  const {
    form,
    handleSubmitWithAction,
    form: { reset },
  } = useHookFormAction(
    replaceWorkingHoursMembersAction.bind(
      null,
      workspaceId,
      workingHours?.id ?? "",
    ),
    zodResolver(setWorkingHoursMembersRequest),
    {
      actionProps: {
        onSuccess: () => {
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
        defaultValues: { userIds: workingHours?.memberUserIds ?? [] },
      },
      errorMapProps: {},
    },
  )

  useEffect(() => {
    if (workingHours) {
      reset({ userIds: workingHours.memberUserIds })
    }
  }, [workingHours, reset])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("workingHours.employeesDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("workingHours.employeesDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <MultiSelectField
              description={t("workingHours.employeesDialog.moveHelp")}
              label={t("workingHours.employees")}
              labels={{
                clear: t("actions.clear"),
                clearAllAriaLabel: (count) =>
                  t("workingHours.employeesDialog.clearAllAria", { count }),
                close: t("workingHours.employeesDialog.close"),
                empty: t("workingHours.employeesDialog.empty"),
                optionsAriaLabel: t("workingHours.employees"),
                removeAriaLabel: (name) =>
                  t("workingHours.employeesDialog.removeAria", { name }),
                searchAriaLabel: t("workingHours.employeesDialog.searchAria"),
                searchPlaceholder: t("workingHours.employeesDialog.search"),
                selectAll: () => t("workingHours.employeesDialog.selectAll"),
              }}
              name="userIds"
              options={employees}
              placeholder={t("workingHours.employeesDialog.placeholder")}
            />
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="outline">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button disabled={form.formState.isSubmitting} type="submit">
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
