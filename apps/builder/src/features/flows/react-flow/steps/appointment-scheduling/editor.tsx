"use client"

import {
  type AppointmentSchedulingStepSchema,
  appointmentSchedulingModes,
  appointmentSchedulingStepSchema,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarClockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import type { Resolver, SubmitHandler } from "react-hook-form"
import { useForm, useFormContext } from "react-hook-form"
import { useAppointmentCalendarSelectOptions } from "@/features/appointment-calendars/provider/appointment-calendar-hook"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"
import { useParentStepCommit } from "../base/use-parent-step-commit"

export function AppointmentSchedulingStepEditor({
  parentName,
}: {
  parentName: string
}) {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={CalendarClockIcon}
      title={t("flows.actions.appointmentScheduling")}
    >
      <AppointmentSchedulingDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function AppointmentSchedulingDialog({ parentName }: { parentName: string }) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { getValues } = useFormContext()
  const commitStep =
    useParentStepCommit<AppointmentSchedulingStepSchema>(parentName)
  const calendarOptions = useAppointmentCalendarSelectOptions()

  const form = useForm<AppointmentSchedulingStepSchema>({
    resolver: zodResolver(
      appointmentSchedulingStepSchema,
    ) as Resolver<AppointmentSchedulingStepSchema>,
    defaultValues: getValues(parentName),
    mode: "onChange",
  })

  const mode = form.watch("mode")
  const modeOptions = useMemo(
    () =>
      appointmentSchedulingModes.options.map((value) => ({
        value,
        label: t(`appointmentScheduling.flowModes.${value}`),
      })),
    [t],
  )

  const onSubmit: SubmitHandler<AppointmentSchedulingStepSchema> = (values) => {
    commitStep(values)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("flows.actions.appointmentScheduling")}</DialogTitle>
          <DialogDescription>
            {t("appointmentScheduling.dialogDescriptions.flowStep")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <SelectField
              label={t("appointmentScheduling.fields.mode")}
              name="mode"
              options={modeOptions}
              required
            />
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              label={t("appointmentCalendars.singular")}
              name="calendarId"
              options={calendarOptions}
              placeholder={t("actions.pleaseSelect")}
              required
            />
            {mode === appointmentSchedulingModes.enum.book ? (
              <CustomFieldSelect
                allowCreate
                createDefaultType="datetime"
                customFieldTypes={["date", "datetime"]}
                label={t("appointmentScheduling.fields.dateTimeFieldId")}
                name="dateTimeFieldId"
                required
              />
            ) : null}
            {mode === appointmentSchedulingModes.enum.checkAvailability ? (
              <>
                <CustomFieldSelect
                  allowCreate
                  createDefaultType="datetime"
                  customFieldTypes={["date", "datetime"]}
                  label={t(
                    "appointmentScheduling.fields.startDateFieldIdSelected",
                  )}
                  name="startDateFieldId"
                  required
                />
                <CustomFieldSelect
                  allowCreate
                  createDefaultType="datetime"
                  customFieldTypes={["date", "datetime"]}
                  label={t(
                    "appointmentScheduling.fields.endDateFieldIdSelected",
                  )}
                  name="endDateFieldId"
                  required
                />
                <SwitchField
                  label={t("appointmentScheduling.fields.resultUsedByAI")}
                  name="resultUsedByAI"
                />
                <CustomFieldSelect
                  allowCreate
                  createDefaultType="shortText"
                  customFieldTypes={["shortText", "longText"]}
                  label={t("appointmentScheduling.fields.outputCustomFieldId")}
                  name="outputCustomFieldId"
                  required
                />
              </>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button disabled={!form.formState.isValid} type="submit">
                {t("actions.continue")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
