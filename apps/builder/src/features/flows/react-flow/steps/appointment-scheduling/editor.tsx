"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  type AppointmentSchedulingMode,
  type AppointmentSchedulingStepSchema,
  appointmentSchedulingModes,
  appointmentSchedulingStepSchema,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
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
import { Form, FormField } from "@chatbotx.io/ui/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarClockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useId, useMemo, useState } from "react"
import type { Resolver, SubmitHandler } from "react-hook-form"
import { useForm, useFormContext } from "react-hook-form"
import { useAppointmentCalendarSelectOptions } from "@/features/appointment-calendars/provider/appointment-calendar-hook"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import { BaseStepEditor } from "../base/editor"
import { useParentStepCommit } from "../base/use-parent-step-commit"

const datetimeFieldSelectProps: {
  allowCreate: true
  createDefaultType: CustomFieldType
  customFieldTypes: CustomFieldType[]
} = {
  allowCreate: true,
  createDefaultType: "datetime",
  customFieldTypes: ["date", "datetime"],
}

type TranslationKey = Parameters<ReturnType<typeof useTranslations>>[0]
type AppointmentModeOption = {
  value: AppointmentSchedulingMode
  label: string
}

const normalizeAppointmentMode = (
  value: unknown,
  options: AppointmentModeOption[],
) => {
  const parsed = appointmentSchedulingModes.safeParse(value)
  if (parsed.success) {
    return parsed.data
  }

  if (typeof value !== "string") {
    return
  }

  return options.find((option) => option.label === value)?.value
}

const normalizeAppointmentStepMode = (
  value: unknown,
  options: AppointmentModeOption[],
): AppointmentSchedulingStepSchema => {
  if (!value || typeof value !== "object" || !("mode" in value)) {
    return value as AppointmentSchedulingStepSchema
  }

  const mode = normalizeAppointmentMode(value.mode, options)
  if (!mode || mode === value.mode) {
    return value as AppointmentSchedulingStepSchema
  }

  return {
    ...value,
    mode,
  } as AppointmentSchedulingStepSchema
}

const isSelectedOptionValue = (options: { value: string }[], value: unknown) =>
  typeof value === "string" && options.some((option) => option.value === value)

function DateTimeFieldSelect({
  labelKey,
  name,
}: {
  labelKey: TranslationKey
  name: "dateTimeFieldId" | "startDateFieldId" | "endDateFieldId"
}) {
  const t = useTranslations()
  return (
    <CustomFieldSelect
      {...datetimeFieldSelectProps}
      label={t(labelKey)}
      name={name}
      required
    />
  )
}

function DateRangeFields({
  endLabelKey,
  startLabelKey,
}: {
  endLabelKey: TranslationKey
  startLabelKey: TranslationKey
}) {
  return (
    <>
      <DateTimeFieldSelect labelKey={startLabelKey} name="startDateFieldId" />
      <DateTimeFieldSelect labelKey={endLabelKey} name="endDateFieldId" />
    </>
  )
}

/**
 * Local guarded replacement for `SelectField` on the "mode" field only.
 * Base UI's Select self-corrects to `null` when its controlled value
 * transiently doesn't match a registered item (e.g. while items mount on
 * dialog open, or during `form.reset()`), and `SelectField` forwards that
 * `null` straight into RHF without a guard — instantly tripping the
 * discriminatedUnion resolver. Guard here instead of patching the shared
 * component.
 */
function AppointmentModeField({
  onModeChange,
  options,
}: {
  onModeChange: (mode: AppointmentSchedulingMode) => void
  options: AppointmentModeOption[]
}) {
  const t = useTranslations()
  const modeFieldId = useId()
  const { clearErrors, control } =
    useFormContext<AppointmentSchedulingStepSchema>()
  const items = useMemo(
    () =>
      Object.fromEntries(
        options.map((option) => [option.value, option.label]),
      ) as Record<AppointmentSchedulingMode, string>,
    [options],
  )

  return (
    <FormField
      control={control}
      name="mode"
      render={({ field }) => (
        <div className="grid w-full gap-2">
          <label
            className="flex items-center gap-1 font-medium text-sm leading-none"
            htmlFor={modeFieldId}
          >
            {t("appointmentScheduling.fields.mode")}
          </label>
          <Select
            items={items}
            onValueChange={(value) => {
              const nextMode = normalizeAppointmentMode(value, options)
              if (!nextMode) {
                return
              }
              field.onChange(nextMode)
              clearErrors("mode")
              onModeChange(nextMode)
            }}
            value={field.value ?? ""}
          >
            <SelectTrigger className="w-full" id={modeFieldId}>
              <SelectValue placeholder={t("actions.pleaseSelect")} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  )
}

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
  const dateTimeCustomFieldOptions = useCustomFieldSelectOptions({
    customFieldTypes: ["date", "datetime"],
  })
  const outputCustomFieldOptions = useCustomFieldSelectOptions({
    customFieldTypes: ["shortText", "longText"],
  })
  const modeOptions = useMemo(
    () =>
      appointmentSchedulingModes.options.map((value) => ({
        value,
        label: t(`appointmentScheduling.flowModes.${value}`),
      })),
    [t],
  )
  const resolver = useMemo(() => {
    const baseResolver = zodResolver(
      appointmentSchedulingStepSchema,
    ) as Resolver<AppointmentSchedulingStepSchema>

    const normalizedResolver: Resolver<AppointmentSchedulingStepSchema> = (
      values,
      context,
      options,
    ) =>
      baseResolver(
        normalizeAppointmentStepMode(values, modeOptions),
        context,
        options,
      )

    return normalizedResolver
  }, [modeOptions])

  const form = useForm<AppointmentSchedulingStepSchema>({
    resolver,
    defaultValues: normalizeAppointmentStepMode(
      getValues(parentName),
      modeOptions,
    ),
    mode: "onChange",
  })

  const mode = form.watch("mode")
  const values = form.watch()

  const areSelectedOptionsValid = (() => {
    if (!isSelectedOptionValue(calendarOptions, values.calendarId)) {
      return false
    }

    switch (mode) {
      case appointmentSchedulingModes.enum.bookFromCustomField:
        return (
          "dateTimeFieldId" in values &&
          isSelectedOptionValue(
            dateTimeCustomFieldOptions,
            values.dateTimeFieldId,
          )
        )
      case appointmentSchedulingModes.enum.checkAvailabilityFromCustomField:
        return (
          "startDateFieldId" in values &&
          isSelectedOptionValue(
            dateTimeCustomFieldOptions,
            values.startDateFieldId,
          ) &&
          "endDateFieldId" in values &&
          isSelectedOptionValue(
            dateTimeCustomFieldOptions,
            values.endDateFieldId,
          ) &&
          "outputCustomFieldId" in values &&
          isSelectedOptionValue(
            outputCustomFieldOptions,
            values.outputCustomFieldId,
          )
        )
      case appointmentSchedulingModes.enum.checkAvailability:
        return (
          "outputCustomFieldId" in values &&
          isSelectedOptionValue(
            outputCustomFieldOptions,
            values.outputCustomFieldId,
          )
        )
      case appointmentSchedulingModes.enum.book:
      case appointmentSchedulingModes.enum.cancel:
        return true
      default:
        return false
    }
  })()

  const onSubmit: SubmitHandler<AppointmentSchedulingStepSchema> = (values) => {
    commitStep(normalizeAppointmentStepMode(values, modeOptions))
    setOpen(false)
  }

  const resetForMode = (nextMode: AppointmentSchedulingMode) => {
    const values = form.getValues()
    const baseValues = {
      id: values.id,
      stepType: values.stepType,
      calendarId: values.calendarId,
      states: values.states,
    }

    const nextValues = (() => {
      switch (nextMode) {
        case appointmentSchedulingModes.enum.bookFromCustomField:
          return {
            ...baseValues,
            mode: nextMode,
            dateTimeFieldId:
              "dateTimeFieldId" in values ? values.dateTimeFieldId : "",
          }
        case appointmentSchedulingModes.enum.checkAvailabilityFromCustomField:
          return {
            ...baseValues,
            mode: nextMode,
            startDateFieldId:
              "startDateFieldId" in values ? values.startDateFieldId : "",
            endDateFieldId:
              "endDateFieldId" in values ? values.endDateFieldId : "",
            resultUsedByAI:
              "resultUsedByAI" in values ? values.resultUsedByAI : false,
            outputCustomFieldId:
              "outputCustomFieldId" in values ? values.outputCustomFieldId : "",
          }
        case appointmentSchedulingModes.enum.checkAvailability:
          return {
            ...baseValues,
            mode: nextMode,
            resultUsedByAI:
              "resultUsedByAI" in values ? values.resultUsedByAI : false,
            outputCustomFieldId:
              "outputCustomFieldId" in values ? values.outputCustomFieldId : "",
          }
        case appointmentSchedulingModes.enum.book:
        case appointmentSchedulingModes.enum.cancel:
          return {
            ...baseValues,
            mode: nextMode,
          }
        default:
          return {
            ...baseValues,
            mode: nextMode,
          }
      }
    })()

    form.reset(nextValues)
    form.clearErrors("mode")
    form.trigger().catch(() => undefined)
  }

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset(normalizeAppointmentStepMode(getValues(parentName), modeOptions))
    form.clearErrors("mode")
    form.trigger().catch(() => undefined)
  }, [form, getValues, modeOptions, open, parentName])

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
            <AppointmentModeField
              onModeChange={resetForMode}
              options={modeOptions}
            />
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              label={t("appointmentCalendars.singular")}
              name="calendarId"
              options={calendarOptions}
              placeholder={t("actions.pleaseSelect")}
              required
            />
            {mode === appointmentSchedulingModes.enum.bookFromCustomField ? (
              <DateTimeFieldSelect
                labelKey="appointmentScheduling.fields.dateTimeFieldIdSource"
                name="dateTimeFieldId"
              />
            ) : null}
            {mode ===
            appointmentSchedulingModes.enum.checkAvailabilityFromCustomField ? (
              <>
                <DateRangeFields
                  endLabelKey="appointmentScheduling.fields.endDateFieldId"
                  startLabelKey="appointmentScheduling.fields.startDateFieldId"
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
            {mode === appointmentSchedulingModes.enum.checkAvailability ? (
              <>
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
              <Button
                disabled={
                  !(form.formState.isValid && areSelectedOptionsValid) ||
                  form.formState.isSubmitting
                }
                type="submit"
              >
                {t("actions.continue")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
