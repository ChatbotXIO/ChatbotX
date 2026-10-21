"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { createOpenHoursAction } from "../actions/save-open-hours.action"
import { OpenHoursEditor, type OpenHoursFormRow } from "./open-hours-editor"

type OpenHoursFormValues = { name: string; openHours: OpenHoursFormRow[] }

/** Creates a named open-hours schedule and hands its id back. */
export function OpenHoursDialog({
  workspaceId,
  open,
  onOpenChange,
  onCreated,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (openHoursId: string) => void
}) {
  const t = useTranslations("openHours")
  const form = useForm<OpenHoursFormValues>({
    defaultValues: {
      name: "",
      openHours: [{ day: "1", from: "09:00", to: "17:00" }],
    },
  })
  const { execute, isPending } = useAction(
    createOpenHoursAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        toast.success(t("created"))
        onOpenChange(false)
        form.reset()
        if (data) {
          onCreated(data.id)
        }
      },
      onError: toastActionError(t("saveError")),
    },
  )

  const onSubmit = form.handleSubmit((values) =>
    execute({
      name: values.name,
      ranges: values.openHours.map((range) => ({
        ...range,
        day: Number(range.day),
      })),
    }),
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          {/* Nested inside another form on the settings and vendor pages, so
              submitting must not bubble to the outer one. */}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.stopPropagation()
              onSubmit(event)
            }}
          >
            <InputField
              label={t("name")}
              name="name"
              placeholder={t("namePlaceholder")}
              required
            />
            <OpenHoursEditor />
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="outline">
                    {t("cancel")}
                  </Button>
                }
              />
              <Button disabled={isPending} type="submit">
                {t("continue")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
