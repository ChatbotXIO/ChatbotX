"use client"

import {
  appointmentBufferMinutes,
  appointmentDurationMinutes,
  appointmentLocationTypes,
  appointmentReminderTimingUnits,
  appointmentScheduleWindowConfigSchema,
  appointmentScheduleWindowTypes,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { DatePickerField } from "@chatbotx.io/ui/components/form/date-picker-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import {
  SelectField,
  type SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { NumberInput } from "@chatbotx.io/ui/components/ui/input-number"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  InfoIcon,
  Loader2Icon,
  PlusIcon,
  TrashIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useRef, useState } from "react"
import { useFieldArray } from "react-hook-form"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { allTimezoneOptions } from "@/features/workspaces/schema/types"
import { updateAppointmentCalendarAction } from "../actions/update-appointment-calendar.action"
import type { getAppointmentCalendar } from "../queries"
import {
  noAppointmentCalendarSelectionValue,
  type UpdateAppointmentCalendarRequest,
  updateAppointmentCalendarRequest,
} from "../schemas/action"
import { AppointmentCalendarWeekdayEditor } from "./appointment-calendar-weekday-editor"

type CalendarForEdit = Awaited<ReturnType<typeof getAppointmentCalendar>>
type AppointmentReminder = UpdateAppointmentCalendarRequest["reminders"][number]
type AppointmentReminderDraft = Omit<AppointmentReminder, "timingValue"> & {
  timingValue?: number
}

const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const
const APPOINTMENT_CALENDAR_TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  ...allTimezoneOptions.filter((option) => option.value !== "UTC"),
]
const DEFAULT_REMINDER_DRAFT = {
  flowId: noAppointmentCalendarSelectionValue,
  timingValue: 1,
  timingUnit: "minutes",
} satisfies AppointmentReminderDraft
const DEFAULT_REMINDER_TIMINGS = [
  { timingValue: 10, timingUnit: "minutes" },
  { timingValue: 1, timingUnit: "hours" },
  { timingValue: 1, timingUnit: "days" },
] as const satisfies Pick<AppointmentReminder, "timingValue" | "timingUnit">[]
const REMINDER_TIMING_LABEL_KEY_BY_UNIT = {
  minutes: "appointmentCalendars.reminderTimingLabels.minutes",
  hours: "appointmentCalendars.reminderTimingLabels.hours",
  days: "appointmentCalendars.reminderTimingLabels.days",
} as const satisfies Record<AppointmentReminder["timingUnit"], string>

function resolveScheduleWindowConfigDefaults(
  calendar: CalendarForEdit,
): UpdateAppointmentCalendarRequest["scheduleWindowConfig"] {
  const fallback = {
    scheduleWindowType: appointmentScheduleWindowTypes.enum.rollingDays,
    rollingDays: 30,
    minAdvanceDays: 0,
  } satisfies UpdateAppointmentCalendarRequest["scheduleWindowConfig"]
  const rawConfig =
    (calendar.scheduleWindowConfig as Record<string, unknown>) ?? {}
  const rawMinAdvanceDays = rawConfig.minAdvanceDays
  const minAdvanceDays =
    typeof rawMinAdvanceDays === "number" && rawMinAdvanceDays >= 0
      ? rawMinAdvanceDays
      : 0
  const parsed = appointmentScheduleWindowConfigSchema.safeParse({
    scheduleWindowType: calendar.scheduleWindowType,
    ...rawConfig,
    minAdvanceDays,
  })
  const base = parsed.success ? parsed.data : fallback

  if (base.scheduleWindowType === "rollingDays") {
    return base
  }
  if (base.scheduleWindowType === "dateRange") {
    return base
  }
  if (base.scheduleWindowType === "specificDay") {
    return base
  }
  return base
}

function normalizeAvailabilityMinuteInterval(interval: {
  startMinute: number
  endMinute: number
}) {
  const normalizedStart = Math.floor(interval.startMinute / 15) * 15
  const normalizedEnd =
    interval.endMinute >= 23 * 60 + 59
      ? 23 * 60 + 59
      : Math.ceil(interval.endMinute / 15) * 15
  const startMinute = Math.min(Math.max(normalizedStart, 0), 23 * 60 + 45)
  const endMinute = Math.min(Math.max(normalizedEnd, 15), 23 * 60 + 59)

  return {
    startMinute,
    endMinute:
      endMinute > startMinute
        ? endMinute
        : Math.min(startMinute + 15, 23 * 60 + 59),
  }
}

function buildDefaultValues(
  calendar: CalendarForEdit,
): UpdateAppointmentCalendarRequest {
  return {
    name: calendar.name,
    description: calendar.description ?? "",
    active: calendar.active,
    timezone: calendar.timezone,
    durationMinutes: calendar.durationMinutes,
    bufferAfterMinutes: calendar.bufferAfterMinutes ?? null,
    locationType: calendar.locationType,
    locationDetail: calendar.locationDetail ?? "",
    scheduleWindowConfig: resolveScheduleWindowConfigDefaults(calendar),
    maxAppointmentsPerUser: calendar.maxAppointmentsPerUser,
    dailyLimitEnabled: calendar.dailyLimitEnabled,
    maxPerDay: calendar.maxPerDay,
    allowGroupMeeting: calendar.allowGroupMeeting,
    maxPerSlot: calendar.maxPerSlot,
    confirmationMessage: calendar.confirmationMessage ?? "",
    confirmationFlowId:
      calendar.confirmationFlowId ?? noAppointmentCalendarSelectionValue,
    cancellationFlowId:
      calendar.cancellationFlowId ?? noAppointmentCalendarSelectionValue,
    externalConnectionId:
      calendar.externalConnectionId ?? noAppointmentCalendarSelectionValue,
    availability: calendar.availability.map((interval) => ({
      weekday: interval.weekday,
      ...normalizeAvailabilityMinuteInterval(interval),
    })),
    reminders: calendar.reminders.map((reminder) => ({
      flowId: reminder.flowId,
      timingValue: reminder.timingValue,
      timingUnit: reminder.timingUnit,
    })),
  }
}

function formatIntervalTimeRange(interval: {
  startMinute: number
  endMinute: number
}): string {
  const start = `${String(Math.floor(interval.startMinute / 60)).padStart(2, "0")}:${String(interval.startMinute % 60).padStart(2, "0")}`
  const end = `${String(Math.floor(interval.endMinute / 60)).padStart(2, "0")}:${String(interval.endMinute % 60).padStart(2, "0")}`
  return `${start} - ${end}`
}

function ReminderFlowCombobox({
  emptyText,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  value,
}: {
  emptyText: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder: string
  searchPlaceholder?: string
  value: string
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? null

  return (
    <Popover modal={true} onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-expanded={open}
            aria-label={placeholder}
            className={cn(
              "w-80 min-w-80 justify-between",
              !selectedLabel && "text-muted-foreground",
            )}
            role="combobox"
            variant="outline"
          >
            <span className="truncate">{selectedLabel ?? placeholder}</span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput
            className="h-9"
            placeholder={searchPlaceholder ?? placeholder}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                onSelect={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                value={option.label}
              >
                {option.label}
                <CheckIcon
                  className={cn(
                    "ms-auto size-4",
                    option.value === value ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function EditAppointmentCalendarForm({
  calendar,
  externalCalendarOptions,
  workspaceId,
}: {
  calendar: CalendarForEdit
  externalCalendarOptions: SelectOption[]
  workspaceId: string
}) {
  const t = useTranslations()
  const router = useRouter()
  const flowOptions = useFlowSelectOptions()
  const [editingWeekday, setEditingWeekday] = useState<number | null>(null)
  const defaultRemindersInitialized = useRef(false)
  const [newReminder, setNewReminder] = useState<AppointmentReminderDraft>(
    DEFAULT_REMINDER_DRAFT,
  )

  const locationTypeOptions = useMemo(
    () =>
      appointmentLocationTypes.options.map((value) => ({
        value,
        label: t(`appointmentCalendars.locationTypes.${value}`),
      })),
    [t],
  )
  const scheduleWindowTypeOptions = useMemo(
    () =>
      appointmentScheduleWindowTypes.options.map((value) => ({
        value,
        label: t(`appointmentCalendars.scheduleWindowTypes.${value}`),
      })),
    [t],
  )
  const reminderTimingUnitOptions = useMemo(
    () =>
      appointmentReminderTimingUnits.options.map((value) => ({
        value,
        label: t(`appointmentCalendars.reminderTimingUnits.${value}`),
      })),
    [t],
  )
  const externalConnectionOptions = useMemo(
    () => [
      {
        label: t("appointmentCalendars.none"),
        value: noAppointmentCalendarSelectionValue,
      },
      ...externalCalendarOptions,
    ],
    [t, externalCalendarOptions],
  )
  const flowOptionsWithNone = useMemo(
    () => [
      {
        value: noAppointmentCalendarSelectionValue,
        label: t("appointmentCalendars.none"),
      },
      ...flowOptions,
    ],
    [flowOptions, t],
  )
  const durationOptions = useMemo(
    () =>
      appointmentDurationMinutes.options.map((value) => ({
        value,
        label: t("appointmentCalendars.minutesLabel", { count: value }),
      })),
    [t],
  )
  const bufferOptions = useMemo(
    () => [
      {
        value: noAppointmentCalendarSelectionValue,
        label: t("appointmentCalendars.none"),
      },
      ...appointmentBufferMinutes.options.map((value) => ({
        value,
        label: t("appointmentCalendars.minutesLabel", { count: value }),
      })),
    ],
    [t],
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateAppointmentCalendarAction.bind(null, workspaceId, calendar.id),
    zodResolver(updateAppointmentCalendarRequest),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("appointmentCalendars.singular"),
            }),
          )
          router.push(`/space/${workspaceId}/appointment-calendars`)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: buildDefaultValues(calendar),
      },
    },
  )

  const availabilityFieldArray = useFieldArray({
    control: form.control,
    name: "availability",
  })
  const remindersFieldArray = useFieldArray({
    control: form.control,
    name: "reminders",
  })

  const locationType = form.watch("locationType")
  const dailyLimitEnabled = form.watch("dailyLimitEnabled")
  const allowGroupMeeting = form.watch("allowGroupMeeting")
  const maxPerSlot = form.watch("maxPerSlot") as number | null | undefined
  const scheduleWindowType = form.watch(
    "scheduleWindowConfig.scheduleWindowType",
  )
  const minAdvanceDays = form.watch("scheduleWindowConfig.minAdvanceDays") as
    | number
    | undefined
  const availabilityValues = form.watch("availability")
  const reminderValues = form.watch("reminders") as AppointmentReminder[]
  const defaultReminderFlowId = flowOptions[0]?.value

  const handleAddReminder = () => {
    if (
      !newReminder.timingValue ||
      newReminder.flowId === noAppointmentCalendarSelectionValue
    ) {
      return
    }
    remindersFieldArray.append({
      flowId: newReminder.flowId,
      timingValue: newReminder.timingValue,
      timingUnit: newReminder.timingUnit,
    })
    setNewReminder(DEFAULT_REMINDER_DRAFT)
  }

  useEffect(() => {
    if (scheduleWindowType !== "rollingDays") {
      if (minAdvanceDays !== 0) {
        form.setValue("scheduleWindowConfig.minAdvanceDays", 0, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: true,
        })
      }
      return
    }

    if (minAdvanceDays != null && minAdvanceDays >= 0) {
      return
    }

    form.setValue("scheduleWindowConfig.minAdvanceDays", 0, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
  }, [form, minAdvanceDays, scheduleWindowType])

  useEffect(() => {
    if (!allowGroupMeeting || (maxPerSlot != null && maxPerSlot >= 1)) {
      return
    }

    form.setValue("maxPerSlot", 1, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
  }, [allowGroupMeeting, form, maxPerSlot])

  useEffect(() => {
    if (
      defaultRemindersInitialized.current ||
      reminderValues.length > 0 ||
      !defaultReminderFlowId
    ) {
      return
    }

    defaultRemindersInitialized.current = true
    remindersFieldArray.append(
      DEFAULT_REMINDER_TIMINGS.map((reminder) => ({
        flowId: defaultReminderFlowId,
        ...reminder,
      })),
    )
  }, [defaultReminderFlowId, reminderValues.length, remindersFieldArray])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={handleSubmitWithAction}>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-xl">{calendar.name}</h1>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                router.push(`/space/${workspaceId}/appointment-calendars`)
              }
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={!form.formState.isValid || form.formState.isSubmitting}
              type="submit"
            >
              {form.formState.isSubmitting && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {t("actions.save")}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="px-6 py-4">
            <Accordion className="w-full" defaultValue={["appointment"]}>
              <AccordionItem value="appointment">
                <AccordionTrigger className="py-4 text-base">
                  {t("appointmentCalendars.sections.appointment")}
                </AccordionTrigger>
                <AccordionContent className="border-t bg-background px-4 py-6">
                  <div className="grid gap-4">
                    <InputField
                      formItemClassName="max-w-xl"
                      label={t("fields.name.label")}
                      name="name"
                      required
                    />
                    <TextareaField
                      label={t("appointmentCalendars.fields.description")}
                      name="description"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="availability">
                <AccordionTrigger className="py-4 text-base">
                  {t("appointmentCalendars.sections.availability")}
                </AccordionTrigger>
                <AccordionContent className="border-t px-0 pt-6 pb-6">
                  <div className="space-y-8 px-4 sm:px-6">
                    <div className="overflow-x-auto">
                      <div className="flex min-w-[720px] border-y bg-muted/60">
                        {WEEKDAY_ORDER.map((weekday) => (
                          <div
                            className="min-w-0 flex-1 basis-0 px-3 py-4 text-center font-semibold text-xs"
                            key={weekday}
                          >
                            {t(`appointmentCalendars.weekdays.${weekday}`)}
                          </div>
                        ))}
                      </div>
                      <div className="flex min-w-[720px]">
                        {WEEKDAY_ORDER.map((weekday) => {
                          const intervals = availabilityValues.filter(
                            (interval) => interval.weekday === weekday,
                          )
                          return (
                            <div
                              className="flex min-h-28 min-w-0 flex-1 basis-0 flex-col items-center px-3 py-4 text-center"
                              key={weekday}
                            >
                              <div className="flex flex-1 flex-col gap-4">
                                {intervals.length > 0 ? (
                                  intervals.map((interval, index) => (
                                    <p
                                      className="whitespace-nowrap font-medium text-sm"
                                      // biome-ignore lint/suspicious/noArrayIndexKey: availability intervals do not have stable ids
                                      key={index}
                                    >
                                      {formatIntervalTimeRange(interval)}
                                    </p>
                                  ))
                                ) : (
                                  <p className="text-muted-foreground text-sm">
                                    {t(
                                      "appointmentCalendars.weekdayEditor.unavailable",
                                    )}
                                  </p>
                                )}
                              </div>
                              <Button
                                className="mt-4 h-auto p-0 font-normal text-[10px]"
                                onClick={() => setEditingWeekday(weekday)}
                                size="sm"
                                type="button"
                                variant="link"
                              >
                                {t("actions.edit")}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="max-w-[220px]">
                      <ComboboxField
                        description={t(
                          "appointmentCalendars.tooltips.timezone",
                        )}
                        descriptionType="tooltip"
                        formItemClassName="max-w-xs"
                        label={t("appointmentCalendars.fields.timezone")}
                        name="timezone"
                        options={APPOINTMENT_CALENDAR_TIMEZONE_OPTIONS}
                        placeholder={t("actions.pleaseSelect")}
                        required
                      />
                    </div>
                  </div>
                  <AppointmentCalendarWeekdayEditor
                    intervals={
                      editingWeekday == null
                        ? []
                        : availabilityValues
                            .filter(
                              (interval) => interval.weekday === editingWeekday,
                            )
                            .map((interval) => ({
                              startMinute: interval.startMinute,
                              endMinute: interval.endMinute,
                            }))
                    }
                    onOpenChange={(open) => {
                      if (!open) {
                        setEditingWeekday(null)
                      }
                    }}
                    onSave={(intervals) => {
                      if (editingWeekday == null) {
                        return
                      }
                      const others = availabilityValues.filter(
                        (interval) => interval.weekday !== editingWeekday,
                      )
                      availabilityFieldArray.replace([
                        ...others,
                        ...intervals.map((interval) => ({
                          weekday: editingWeekday,
                          ...interval,
                        })),
                      ])
                    }}
                    open={editingWeekday != null}
                    weekdayLabel={
                      editingWeekday == null
                        ? ""
                        : t(`appointmentCalendars.weekdays.${editingWeekday}`)
                    }
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="location">
                <AccordionTrigger className="py-4 text-base">
                  {t("appointmentCalendars.sections.location")}
                </AccordionTrigger>
                <AccordionContent className="border-t bg-background px-4 py-6">
                  <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
                    <SelectField
                      formItemClassName="max-w-sm"
                      label={t("appointmentCalendars.fields.locationType")}
                      name="locationType"
                      options={locationTypeOptions}
                      required
                    />
                    {locationType !== "phoneCall" && (
                      <InputField
                        formItemClassName="max-w-xl"
                        label={t("appointmentCalendars.fields.locationDetail")}
                        name="locationDetail"
                      />
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="notifications">
                <AccordionTrigger className="py-4 text-base">
                  {t("appointmentCalendars.sections.notifications")}
                </AccordionTrigger>
                <AccordionContent className="border-t bg-background px-4 py-6">
                  <div className="flex flex-col gap-4">
                    <TextareaField
                      label={t(
                        "appointmentCalendars.fields.confirmationMessage",
                      )}
                      name="confirmationMessage"
                    />
                    <ComboboxField
                      description={t(
                        "appointmentCalendars.tooltips.confirmationFlow",
                      )}
                      descriptionType="tooltip"
                      emptyText={t("actions.noRecordFound")}
                      formItemClassName="max-w-xl"
                      label={t(
                        "appointmentCalendars.fields.confirmationFlowId",
                      )}
                      name="confirmationFlowId"
                      options={flowOptionsWithNone}
                      placeholder={t("actions.pleaseSelect")}
                    />
                    <ComboboxField
                      description={t(
                        "appointmentCalendars.tooltips.cancellationFlow",
                      )}
                      descriptionType="tooltip"
                      emptyText={t("actions.noRecordFound")}
                      formItemClassName="max-w-xl"
                      label={t(
                        "appointmentCalendars.fields.cancellationFlowId",
                      )}
                      name="cancellationFlowId"
                      options={flowOptionsWithNone}
                      placeholder={t("actions.pleaseSelect")}
                    />

                    <div className="space-y-5">
                      <div className="flex items-center gap-1 font-medium text-sm">
                        <p>{t("appointmentCalendars.fields.reminders")}</p>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <InfoIcon className="size-3.5 cursor-help text-muted-foreground" />
                            }
                          />
                          <TooltipContent className="max-w-sm">
                            {t("appointmentCalendars.tooltips.reminders")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="max-w-[42rem] space-y-2">
                        {remindersFieldArray.fields.map((field, index) => {
                          const reminder = reminderValues[index]
                          if (!reminder) {
                            return null
                          }
                          return (
                            <div
                              className="flex min-h-11 items-center gap-4 ps-4"
                              key={field.id}
                            >
                              <p className="min-w-0 flex-1 text-sm">
                                {t("appointmentCalendars.reminderSummary", {
                                  calendar: calendar.name,
                                  timing: t(
                                    REMINDER_TIMING_LABEL_KEY_BY_UNIT[
                                      reminder.timingUnit
                                    ],
                                    { count: reminder.timingValue },
                                  ),
                                })}
                              </p>
                              <Button
                                onClick={() =>
                                  remindersFieldArray.remove(index)
                                }
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                <TrashIcon className="size-4 text-destructive" />
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-5">
                        <div className="h-px flex-1 bg-border" />
                        <p className="font-medium text-sm">
                          {t("appointmentCalendars.addNew")}
                        </p>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <div className="overflow-x-auto">
                        <div className="flex min-w-[45rem] max-w-[48rem] items-center gap-3">
                          <Label className="h-9">{t("actions.send")}</Label>
                          <ReminderFlowCombobox
                            emptyText={t("actions.noRecordFound")}
                            onChange={(value) =>
                              setNewReminder((current) => ({
                                ...current,
                                flowId: value,
                              }))
                            }
                            options={flowOptionsWithNone}
                            placeholder={t("actions.pleaseSelect")}
                            searchPlaceholder={t("actions.search")}
                            value={newReminder.flowId}
                          />
                          <div className="w-24 shrink-0">
                            <NumberInput
                              className="w-16"
                              min={1}
                              onValueChange={(value) =>
                                setNewReminder((current) => ({
                                  ...current,
                                  timingValue: value,
                                }))
                              }
                              value={newReminder.timingValue}
                            />
                          </div>
                          <Select
                            items={reminderTimingUnitOptions}
                            onValueChange={(value) =>
                              setNewReminder((current) => ({
                                ...current,
                                timingUnit:
                                  value as AppointmentReminder["timingUnit"],
                              }))
                            }
                            value={newReminder.timingUnit}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {reminderTimingUnitOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            disabled={
                              !newReminder.timingValue ||
                              newReminder.flowId ===
                                noAppointmentCalendarSelectionValue
                            }
                            onClick={handleAddReminder}
                            size="icon"
                            type="button"
                          >
                            <PlusIcon className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="restrictions">
                <AccordionTrigger className="py-4 text-base">
                  {t("appointmentCalendars.sections.restrictions")}
                </AccordionTrigger>
                <AccordionContent className="border-t bg-background px-4 py-6">
                  <div className="space-y-6">
                    <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
                      <SelectField
                        description={t(
                          "appointmentCalendars.tooltips.appointmentDuration",
                        )}
                        descriptionType="tooltip"
                        label={t("appointmentCalendars.fields.durationMinutes")}
                        name="durationMinutes"
                        options={durationOptions}
                        required
                      />
                      <SelectField
                        description={t(
                          "appointmentCalendars.tooltips.bufferAfterMinutes",
                        )}
                        descriptionType="tooltip"
                        label={t(
                          "appointmentCalendars.fields.bufferAfterMinutes",
                        )}
                        name="bufferAfterMinutes"
                        options={bufferOptions}
                      />
                    </div>
                    <SelectField
                      description={t(
                        "appointmentCalendars.tooltips.peopleCanSchedule",
                      )}
                      descriptionType="tooltip"
                      formItemClassName="max-w-4xl"
                      label={t(
                        "appointmentCalendars.fields.scheduleWindowType",
                      )}
                      name="scheduleWindowConfig.scheduleWindowType"
                      options={scheduleWindowTypeOptions}
                      required
                    />
                    {scheduleWindowType === "rollingDays" && (
                      <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
                        <InputNumberField
                          description={t(
                            "appointmentCalendars.tooltips.rollingDays",
                          )}
                          descriptionType="tooltip"
                          label={t("appointmentCalendars.fields.rollingDays")}
                          name="scheduleWindowConfig.rollingDays"
                          required
                        />
                        <InputNumberField
                          description={t(
                            "appointmentCalendars.tooltips.minAdvanceDays",
                          )}
                          descriptionType="tooltip"
                          label={t(
                            "appointmentCalendars.fields.minAdvanceDays",
                          )}
                          min={0}
                          name="scheduleWindowConfig.minAdvanceDays"
                          required
                        />
                      </div>
                    )}
                    {scheduleWindowType === "dateRange" && (
                      <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
                        <DatePickerField
                          label={t("appointmentCalendars.fields.startDate")}
                          name="scheduleWindowConfig.startDate"
                          required
                        />
                        <DatePickerField
                          label={t("appointmentCalendars.fields.endDate")}
                          name="scheduleWindowConfig.endDate"
                          required
                        />
                      </div>
                    )}
                    {scheduleWindowType === "specificDay" && (
                      <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
                        <DatePickerField
                          label={t("appointmentCalendars.fields.specificDate")}
                          name="scheduleWindowConfig.date"
                          required
                        />
                      </div>
                    )}
                    <InputNumberField
                      description={t(
                        "appointmentCalendars.tooltips.maxAppointmentsPerUser",
                      )}
                      descriptionType="tooltip"
                      formItemClassName="max-w-4xl"
                      label={t(
                        "appointmentCalendars.fields.maxAppointmentsPerUser",
                      )}
                      name="maxAppointmentsPerUser"
                    />
                    <SwitchField
                      description={t(
                        "appointmentCalendars.tooltips.dailyLimit",
                      )}
                      descriptionType="tooltip"
                      formItemClassName="max-w-xs"
                      label={t("appointmentCalendars.fields.dailyLimitEnabled")}
                      name="dailyLimitEnabled"
                      required
                    />
                    {dailyLimitEnabled && (
                      <InputNumberField
                        formItemClassName="max-w-xs"
                        label={t("appointmentCalendars.fields.maxPerDay")}
                        name="maxPerDay"
                        required
                      />
                    )}
                    <SwitchField
                      description={t(
                        "appointmentCalendars.tooltips.allowGroupMeeting",
                      )}
                      descriptionType="tooltip"
                      formItemClassName="max-w-xs"
                      label={t("appointmentCalendars.fields.allowGroupMeeting")}
                      name="allowGroupMeeting"
                      required
                    />
                    {allowGroupMeeting && (
                      <InputNumberField
                        formItemClassName="max-w-xs"
                        label={t("appointmentCalendars.fields.maxPerSlot")}
                        min={1}
                        name="maxPerSlot"
                        required
                      />
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="external-calendar">
                <AccordionTrigger className="py-4 text-base">
                  {t("appointmentCalendars.sections.externalCalendar")}
                </AccordionTrigger>
                <AccordionContent className="border-t bg-background px-4 py-6">
                  <SelectField
                    description={t(
                      "appointmentCalendars.tooltips.externalCalendar",
                    )}
                    descriptionType="tooltip"
                    formItemClassName="max-w-xl"
                    label={t(
                      "appointmentCalendars.fields.externalConnectionId",
                    )}
                    name="externalConnectionId"
                    options={externalConnectionOptions}
                    placeholder={t(
                      "appointmentCalendars.noExternalConnections",
                    )}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </form>
    </Form>
  )
}
