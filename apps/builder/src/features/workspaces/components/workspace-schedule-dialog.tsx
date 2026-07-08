"use client"

import { TimeField } from "@chatbotx.io/ui/components/form/time-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { updateWorkspaceStatusAction } from "../actions/update-workspace-status-action"

type ScheduleFormValues = {
  startTime: string
  endTime: string
}

export function WorkspaceScheduleDialog({
  workspace,
  open,
  onOpenChange,
  onSuccess,
}: {
  workspace: {
    id: string
    startTime: string | null
    endTime: string | null
  } | null
  open: boolean
  onOpenChange: (val: boolean) => void
  onSuccess?: (schedule: {
    startTime: string | null
    endTime: string | null
  }) => void
}) {
  const t = useTranslations()

  const form = useForm<ScheduleFormValues>({
    defaultValues: { startTime: "", endTime: "" },
  })

  useEffect(() => {
    if (workspace) {
      form.reset({
        startTime: workspace.startTime ?? "",
        endTime: workspace.endTime ?? "",
      })
    }
  }, [workspace, form])

  const { execute, isPending } = useAction(
    updateWorkspaceStatusAction.bind(null, workspace?.id ?? ""),
    {
      onSuccess: ({ input }) => {
        toast.success(t("workspace.schedule.activated"))
        onOpenChange(false)
        onSuccess?.({
          startTime: input.startTime,
          endTime: input.endTime,
        })
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const handleAlwaysRun = () => {
    form.reset({ startTime: "", endTime: "" })
    execute({ isActive: true, startTime: null, endTime: null })
  }

  const handleSaveSchedule = () => {
    const { startTime, endTime } = form.getValues()

    if (!(startTime && endTime)) {
      toast.error(t("workspace.schedule.timeRequired"))
      return
    }

    if (startTime === endTime) {
      toast.error(t("workspace.schedule.invalidTimeRange"))
      return
    }

    execute({ isActive: true, startTime, endTime })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{t("workspace.schedule.title")}</DialogTitle>
          <DialogDescription>
            {t("workspace.schedule.description")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <div className="flex w-full items-end gap-2">
            <div className="flex-1">
              <TimeField<ScheduleFormValues>
                label={t("workspace.schedule.startTime")}
                name="startTime"
                required
              />
            </div>
            <span className="mb-2 text-muted-foreground">-</span>
            <div className="flex-1">
              <TimeField<ScheduleFormValues>
                label={t("workspace.schedule.endTime")}
                name="endTime"
                required
              />
            </div>
          </div>
        </Form>
        <DialogFooter className="justify-end">
          <Button
            disabled={isPending}
            onClick={handleAlwaysRun}
            size="sm"
            type="button"
            variant="outline"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("workspace.schedule.alwaysRun")}
          </Button>
          <Button
            className="ml-auto"
            disabled={isPending}
            onClick={handleSaveSchedule}
            size="sm"
            type="button"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("workspace.schedule.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
