"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
import { updateFbCommentAction } from "../actions/update-fb-comment.action"
import type { FBCommentResource } from "../schema/resource"

const HOURS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0"),
)

const HOUR_OPTIONS = HOURS.map((hour) => ({
  value: `${hour}:00`,
  label: `${hour}:00`,
}))

type ScheduleFormValues = {
  startTime: string
  endTime: string
}

export function FbCommentScheduleDialog({
  fbComment,
  open,
  onOpenChange,
  onSuccess,
}: {
  fbComment: FBCommentResource | null
  open: boolean
  onOpenChange: (val: boolean) => void
  onSuccess?: () => void
}) {
  const t = useTranslations()

  const form = useForm<ScheduleFormValues>({
    defaultValues: { startTime: "", endTime: "" },
  })

  useEffect(() => {
    if (fbComment) {
      form.reset({
        startTime: fbComment.startTime ?? "",
        endTime: fbComment.endTime ?? "",
      })
    }
  }, [fbComment, form])

  const { execute, isPending } = useAction(
    updateFbCommentAction.bind(
      null,
      fbComment?.workspaceId ?? "",
      fbComment?.id ?? "",
    ),
    {
      onSuccess: () => {
        toast.success(t("facebookCommentAutomation.activated"))
        onOpenChange(false)
        onSuccess?.()
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
      toast.error(t("facebookCommentAutomation.schedule.timeRequired"))
      return
    }

    if (startTime >= endTime) {
      toast.error(t("facebookCommentAutomation.schedule.invalidTimeRange"))
      return
    }

    execute({ isActive: true, startTime, endTime })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t("facebookCommentAutomation.schedule.title")}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...form}>
          <div className="flex items-end gap-2">
            <div className="w-30">
              <SelectField<ScheduleFormValues>
                label={t("facebookCommentAutomation.schedule.startTime")}
                name="startTime"
                options={HOUR_OPTIONS}
                placeholder="-"
              />
            </div>
            <span className="mb-2 text-muted-foreground">-</span>
            <div className="w-30">
              <SelectField<ScheduleFormValues>
                label={t("facebookCommentAutomation.schedule.endTime")}
                name="endTime"
                options={HOUR_OPTIONS}
                placeholder="-"
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
            {t("facebookCommentAutomation.schedule.alwaysRun")}
          </Button>
          <Button
            className="ml-auto"
            disabled={isPending}
            onClick={handleSaveSchedule}
            size="sm"
            type="button"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t("facebookCommentAutomation.schedule.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
