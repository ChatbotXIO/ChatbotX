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
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type {
  CommentAutomationRow,
  CommentAutomationTranslationNamespace,
} from "./types"

type ScheduleFormValues = {
  startTime: string
  endTime: string
}

type ScheduleActionInput = {
  isActive: boolean
  startTime: string | null
  endTime: string | null
}

export function CommentAutomationScheduleDialog({
  resource,
  open,
  onOpenChange,
  onSuccess,
  translationNamespace,
  action,
}: {
  resource: Pick<
    CommentAutomationRow,
    "id" | "workspaceId" | "startTime" | "endTime"
  > | null
  open: boolean
  onOpenChange: (val: boolean) => void
  translationNamespace: CommentAutomationTranslationNamespace
  // A bound next-safe-action action (`someAction.bind(null, workspaceId, id)`).
  // Called directly rather than through `useAction` — see the sibling delete
  // dialog for why.
  action: (
    input: ScheduleActionInput,
  ) => Promise<{ serverError?: string } | undefined>
  onSuccess?: () => void
}) {
  const t = useTranslations()
  const [isPending, setIsPending] = useState(false)

  const form = useForm<ScheduleFormValues>({
    defaultValues: { startTime: "", endTime: "" },
  })

  useEffect(() => {
    if (resource) {
      form.reset({
        startTime: resource.startTime ?? "",
        endTime: resource.endTime ?? "",
      })
    }
  }, [resource, form])

  const runAction = async (input: ScheduleActionInput) => {
    setIsPending(true)
    const result = await action(input)
    setIsPending(false)

    if (result?.serverError) {
      toast.error(result.serverError)
      return
    }

    toast.success(t(`${translationNamespace}.activated`))
    onOpenChange(false)
    onSuccess?.()
  }

  const handleAlwaysRun = () => {
    form.reset({ startTime: "", endTime: "" })
    runAction({ isActive: true, startTime: null, endTime: null })
  }

  const handleSaveSchedule = () => {
    const { startTime, endTime } = form.getValues()

    if (!(startTime && endTime)) {
      toast.error(t(`${translationNamespace}.schedule.timeRequired`))
      return
    }

    if (startTime === endTime) {
      toast.error(t(`${translationNamespace}.schedule.invalidTimeRange`))
      return
    }

    runAction({ isActive: true, startTime, endTime })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>
            {t(`${translationNamespace}.schedule.title`)}
          </DialogTitle>
          <DialogDescription>
            {t(`${translationNamespace}.schedule.description`)}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <div className="flex w-full items-end gap-2">
            <div className="flex-1">
              <TimeField<ScheduleFormValues>
                label={t(`${translationNamespace}.schedule.startTime`)}
                name="startTime"
                required
              />
            </div>
            <span className="mb-2 text-muted-foreground">-</span>
            <div className="flex-1">
              <TimeField<ScheduleFormValues>
                label={t(`${translationNamespace}.schedule.endTime`)}
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
            {t(`${translationNamespace}.schedule.alwaysRun`)}
          </Button>
          <Button
            className="ms-auto"
            disabled={isPending}
            onClick={handleSaveSchedule}
            size="sm"
            type="button"
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {t(`${translationNamespace}.schedule.save`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
